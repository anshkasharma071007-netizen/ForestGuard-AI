"""Back up a WAL-mode SQLite database and the corresponding upload directory."""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
from contextlib import closing
from pathlib import Path


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def media_hashes(root):
    return {str(p.relative_to(root)): checksum(p) for p in root.rglob("*") if p.is_file()}


def verify(directory):
    manifest = json.loads((directory / "sha256.json").read_text())
    actual = {"forest_guard.db": checksum(directory / "forest_guard.db")}
    actual.update({f"uploads/{k}": v for k, v in media_hashes(directory / "uploads").items()})
    if actual != manifest:
        raise ValueError("Database or media checksum mismatch")
    uri = (directory / "forest_guard.db").resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("SQLite foreign key check failed")
        refs = db.execute("""
            SELECT image_path FROM detections UNION ALL SELECT annotated_path FROM detections
            UNION ALL SELECT image_path FROM incidents UNION ALL SELECT image_path FROM sighting_reports
        """)
        paths = [path for (path,) in refs if path]
        if any(f"uploads/{path}" not in manifest for path in paths):
            raise ValueError("Snapshot is missing referenced media")
    print(f"Verified database, {len(actual) - 1} files, {len(paths)} media references.")


def backup(source, uploads, output):
    uri = source.resolve(strict=True).as_uri() + "?mode=ro"
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    with closing(sqlite3.connect(uri, uri=True)) as src:
        with closing(sqlite3.connect(output / "forest_guard.db")) as dest:
            src.backup(dest)
            dest.execute("PRAGMA journal_mode=DELETE")
    shutil.copytree(uploads, output / "uploads")
    files = media_hashes(uploads)
    manifest = {"forest_guard.db": checksum(output / "forest_guard.db")}
    manifest.update({f"uploads/{k}": v for k, v in files.items()})
    (output / "sha256.json").write_text(json.dumps(manifest, indent=2))
    verify(output)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    save = commands.add_parser("backup")
    save.add_argument("database", type=Path)
    save.add_argument("uploads", type=Path)
    save.add_argument("directory", type=Path)
    check = commands.add_parser("verify")
    check.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.action == "backup":
        backup(args.database, args.uploads, args.directory)
    else:
        verify(args.directory)
