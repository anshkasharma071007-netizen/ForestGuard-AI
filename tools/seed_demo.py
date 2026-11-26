"""Populate the configured, empty local database with the bundled demo dataset."""

import json

from backend.database.session import SessionLocal
from backend.services.seed import seed_database


if __name__ == "__main__":
    with SessionLocal() as session:
        result = seed_database(session)
    if result["seeded"]:
        print("Demonstration dataset created.")
        print(json.dumps(result["counts"], indent=2))
    else:
        print(f"Seed skipped. {result['reason']}")
