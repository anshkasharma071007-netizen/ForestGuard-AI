"""Keep integration tests on disposable local database targets."""

import os
import re
from pathlib import Path

from sqlalchemy.engine import URL, make_url


def local_test_database_url(value: str) -> URL:
    url = make_url(value)
    host = url.query.get("host") or url.host or os.getenv("PGHOST", "")
    database = url.database
    if (
        url.get_backend_name() != "postgresql"
        or not database
        or not re.fullmatch(r"[a-zA-Z0-9_-]+", database)
        or not re.search(r"(^|[_-])test($|[_-])", database)
        or not isinstance(host, str)
        or "," in host
        or (host not in {"", "localhost", "127.0.0.1", "::1"} and not host.startswith("/"))
        or {"dbname", "hostaddr", "service", "options"} & url.query.keys()
        or os.getenv("PGHOSTADDR")
        or os.getenv("PGSERVICE")
    ):
        raise ValueError("Tests require a dedicated local PostgreSQL database with 'test' in its name.")
    return url


def use_isolated_profile(directory: Path) -> None:
    profile = directory / "backend.env"
    profile.touch()
    os.environ.update(FOREST_GUARD_DB_MODE="local", FOREST_GUARD_ENV_FILE=str(profile))
