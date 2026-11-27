import os
import subprocess
import sys

import pytest
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

from backend.database.session import create_database_engine, validate_runtime_database
from backend.tests.database import local_test_database_url


def run_cloud_profile(path, program):
    return subprocess.run(
        [sys.executable, "-c", program],
        env={
            "PATH": os.environ["PATH"],
            "FOREST_GUARD_DB_MODE": "cloud",
            "FOREST_GUARD_ENV_FILE": str(path),
            "DATABASE_URL": "postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_ai",
        },
        capture_output=True,
        text=True,
    )


@pytest.fixture
def cloud_profile(tmp_path):
    certificate = tmp_path / "test ca.crt"
    certificate.touch()  # These tests validate configuration without opening a connection.
    settings = {
        "CLOUD_DATABASE_HOST": "aws-1-ap-northeast-1.pooler.supabase.com",
        "CLOUD_DATABASE_USER": "forest_guard_app." + "a" * 20,
        "CLOUD_DATABASE_PASSWORD": "'literal:@/%%${secret}'",
        "CLOUD_DATABASE_SSL_ROOT_CERT": str(certificate),
        "UPLOAD_DIR": str(tmp_path / "uploads"),
    }
    return settings


def save_profile(tmp_path, values):
    profile = tmp_path / ".env.cloud"
    profile.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
    return profile


def test_cloud_engine_pins_pooler_and_tls(tmp_path, cloud_profile):
    profile = save_profile(tmp_path, cloud_profile)
    result = run_cloud_profile(profile, """
from backend.database.session import engine
_, args = engine.dialect.create_connect_args(engine.url)
assert args['host'] == 'aws-1-ap-northeast-1.pooler.supabase.com'
assert args['port'] == 5432 and args['dbname'] == 'postgres'
assert args['user'] == 'forest_guard_app.' + 'a' * 20
assert args['password'] == 'literal:@/%%${secret}'
assert args['sslmode'] == 'verify-full' and args['sslrootcert'].endswith('test ca.crt')
assert args['gssencmode'] == 'disable'
assert args['connect_timeout'] == '5'
assert engine.pool.size() == 3 and engine.pool.timeout() == 5
""")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(("key", "value"), [
    ("CLOUD_DATABASE_HOST", "127.0.0.1"),
    ("CLOUD_DATABASE_USER", "postgres." + "a" * 20),
    ("CLOUD_DATABASE_PASSWORD", ""),
    ("CLOUD_DATABASE_SSL_ROOT_CERT", "missing.crt"),
    ("PGHOSTADDR", "127.0.0.1"),
])
def test_invalid_cloud_settings_do_not_use_local_url(tmp_path, cloud_profile, key, value):
    cloud_profile[key] = value
    result = run_cloud_profile(save_profile(tmp_path, cloud_profile), "from backend import config")
    assert result.returncode != 0
    assert key in result.stderr


def test_missing_selected_profile_fails(tmp_path):
    result = run_cloud_profile(tmp_path / "missing.env", "from backend import config")
    assert result.returncode != 0
    assert "selected cloud environment file does not exist" in result.stderr


def test_runtime_rejects_owner_url_before_opening_connection():
    url = URL.create("postgresql+psycopg", username="postgres", host="127.0.0.1", database="forest_guard")
    with Session(create_database_engine(url)) as db, pytest.raises(RuntimeError, match="restricted database login"):
        validate_runtime_database(db)


def test_test_harness_rejects_remote_postgres():
    with pytest.raises(ValueError, match="dedicated local PostgreSQL"):
        local_test_database_url("postgresql+psycopg://forest_guard_app@db.example.org/forest_guard_test")
