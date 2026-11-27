"""Private evidence storage. Database references identify the storage backend."""
import json
import mimetypes
import os
import re
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.parse import quote

from fastapi import HTTPException, Response
from fastapi.responses import FileResponse
import httpx

from backend import config

PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox",
                   "X-Content-Type-Options": "nosniff"}
PREFIX = "supabase:"
DIRECTORIES = {"community", "uploads", "annotated", "demo"}


class StorageUnavailable(Exception):
    pass


def validate_settings():
    if config.MEDIA_STORAGE not in {"local", "supabase"}:
        raise RuntimeError("Set MEDIA_STORAGE to local or supabase.")
    if config.MEDIA_STORAGE == "supabase":
        _storage_settings()


def _storage_settings():
    url, bucket, key = config.SUPABASE_STORAGE_URL, config.SUPABASE_STORAGE_BUCKET, config.SUPABASE_STORAGE_KEY
    if not (re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url)
            and re.fullmatch(r"[a-zA-Z0-9_-]+", bucket) and key):
        raise RuntimeError("Configure the private Supabase Storage URL, bucket and server key.")
    return url, bucket, key


def _request(method, path, *, content=None, content_type=None):
    try:
        url, bucket, key = _storage_settings()
    except RuntimeError:
        raise StorageUnavailable("Evidence storage is unavailable.") from None
    headers = {"apikey": key, "x-upsert": "false"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    if content_type:
        headers["Content-Type"] = content_type
    try:
        response = httpx.request(method, f"{url}/storage/v1/{path.format(bucket=bucket)}",
                                 headers=headers, content=content, timeout=30, follow_redirects=False)
    except httpx.RequestError:
        raise StorageUnavailable("Evidence storage is unavailable.") from None
    # Some Storage versions report ObjectNotFound through HTTP 400.
    if path.startswith("object/authenticated/") and response.status_code in {400, 404}:
        try:
            error = response.json()
        except ValueError:
            error = {}
        if response.status_code == 404 or (isinstance(error, dict) and error.get("statusCode") in {"404", 404}):
            raise FileNotFoundError("Evidence unavailable.")
    if not response.is_success:
        raise StorageUnavailable("Evidence storage is unavailable.")
    return response


def _relative(path):
    if not path:
        raise FileNotFoundError("Evidence unavailable.")
    relative = PurePosixPath(path)
    if (relative.is_absolute() or len(relative.parts) < 2 or relative.parts[0] not in DIRECTORIES
            or ".." in relative.parts or "\\" in path):
        raise FileNotFoundError("Evidence unavailable.")
    return relative


def _local_path(path):
    relative = _relative(path)
    root = Path(config.UPLOAD_DIR).resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(root / relative.parts[0]):
        raise FileNotFoundError("Evidence unavailable.")
    return target


def _content_type(path):
    mime = mimetypes.guess_type(path)[0]
    if mime in config.ALLOWED_IMAGE_TYPES or mime in config.ALLOWED_VIDEO_TYPES:
        return mime
    return "application/octet-stream"


def save(path: str, content: bytes) -> str:
    _relative(path)
    if config.MEDIA_STORAGE == "supabase":
        response = _request("GET", "bucket/{bucket}")
        try:
            bucket = response.json()
        except ValueError:
            bucket = None
        if not isinstance(bucket, dict) or bucket.get("public") is not False:
            raise StorageUnavailable("Evidence storage requires a private bucket.")
        _request("POST", f"object/{{bucket}}/{quote(path)}", content=content, content_type=_content_type(path))
        return PREFIX + path
    target = _local_path(path)
    try:
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
        except OSError:
            target.unlink(missing_ok=True)
            raise
    except OSError:
        raise StorageUnavailable("Evidence storage is unavailable.") from None
    return path


def save_evidence(path, content):
    try:
        return save(path, content)
    except StorageUnavailable:
        raise HTTPException(503, "Evidence could not be saved. Retry shortly.") from None


def _download(reference):
    path = reference.removeprefix(PREFIX)
    _relative(path)
    return _request("GET", f"object/authenticated/{{bucket}}/{quote(path)}").content


@contextmanager
def local_evidence(reference):
    if reference and reference.startswith(PREFIX):
        with TemporaryDirectory(prefix="fg-evidence-") as scratch:
            path = Path(scratch) / _relative(reference.removeprefix(PREFIX)).name
            path.write_bytes(_download(reference))
            yield path
    else:
        path = _local_path(reference)
        if not path.is_file():
            raise FileNotFoundError("Evidence unavailable.")
        yield path


def evidence_response(reference):
    try:
        if reference and reference.startswith(PREFIX):
            return Response(_download(reference), media_type=_content_type(reference), headers=PRIVATE_HEADERS)
        path = _local_path(reference)
        if path.is_file():
            return FileResponse(path, media_type=_content_type(path.name), headers=PRIVATE_HEADERS)
    except StorageUnavailable:
        raise HTTPException(503, "Evidence storage is temporarily unavailable.") from None
    except FileNotFoundError:
        pass
    raise HTTPException(404, "Photo unavailable.")


def discard_uncommitted(reference):
    try:
        if reference.startswith(PREFIX):
            path = reference.removeprefix(PREFIX)
            _request("DELETE", "object/{bucket}", content=json.dumps({"prefixes": [path]}).encode(),
                     content_type="application/json")
        else:
            _local_path(reference).unlink(missing_ok=True)
    except (StorageUnavailable, OSError):
        # Best effort for an object whose database transaction never committed.
        pass
