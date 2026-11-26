"""Compare the actual FastAPI responses for a read-only SQLite snapshot and PostgreSQL."""

import argparse
import logging
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import config
from backend.database.session import engine, get_db
from backend.main import app


def capture(client, database):
    def session():
        with Session(database) as db:
            if database.dialect.name == "postgresql":
                db.connection().exec_driver_sql("SET TRANSACTION READ ONLY")
            yield db

    app.dependency_overrides[get_db] = session
    response = client.post("/api/auth/login", json={
        "email": config.DEMO_ADMIN_EMAIL, "password": config.DEMO_ADMIN_PASSWORD,
    })
    response.raise_for_status()
    login = response.json()
    headers = {"Authorization": f"Bearer {login.pop('token')}"}
    results = {"auth/login": login}

    def read(key, path, private=True):
        response = client.get("/api/" + path, headers=headers if private else {})
        response.raise_for_status()
        body = response.json()
        # Only the request-time fields vary. Record timestamps are compared verbatim.
        for field in ("generated_at", "updated_at"):
            if field in body:
                body[field] = "<request time>"
        results[key] = body
        return body

    for path in ("auth/me", "overview", "villages", "cameras", "guards", "detections",
                 "tracks", "alerts", "analytics", "incidents", "reports", "guard/dashboard"):
        read(path, path)
    for path in ("community/alerts", "community/villages", "community/summary"):
        read(path, path, False)
    # Detection detail rescoring commits a write. The isolated suite covers that route.
    alerts = results["alerts"]["items"]
    if alerts:
        read("alerts/detail", f"alerts/{alerts[0]['id']}")
    for report in results["reports"]["items"]:
        code = report["reference_code"]
        read(f"public lookup {report['id']}", f"community/reports/{code}", False)
    if client.get("/api/reports").status_code != 401:
        raise ValueError("Unauthenticated report access should return 401")
    return results


def compare(snapshot):
    if engine.dialect.name != "postgresql":
        raise ValueError("Set DATABASE_URL to the PostgreSQL application URL")
    uri = snapshot.resolve(strict=True).as_uri() + "?mode=ro"
    source = create_engine("sqlite://", creator=lambda: sqlite3.connect(
        uri, uri=True, check_same_thread=False
    ))
    try:
        # Call the routes without invoking startup seeding.
        client = TestClient(app)
        try:
            before = capture(client, source)
            after = capture(client, engine)
        finally:
            client.close()
        mismatches = [key for key in before.keys() | after.keys() if before.get(key) != after.get(key)]
        if mismatches:
            raise ValueError(f"Response differences: {', '.join(sorted(mismatches))}")
        print(f"Matched {len(before)} responses including all listed public report lookups; protected access returned 401.")
    finally:
        app.dependency_overrides.pop(get_db, None)
        source.dispose()


if __name__ == "__main__":
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    compare(parser.parse_args().snapshot)
