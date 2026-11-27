"""Provision only the fictional development villages in the configured local database."""

import argparse
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="Private backend environment file")
    args = parser.parse_args()
    if args.env_file:
        if not args.env_file.is_file():
            parser.error("The specified environment file does not exist.")
        os.environ["FOREST_GUARD_ENV_FILE"] = str(args.env_file)

    from backend.database.session import SessionLocal
    from backend.services.villages import provision_demo_villages

    try:
        with SessionLocal() as db:
            results = provision_demo_villages(db)
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
    for code, result in results.items():
        print(f"{code}: {result}")


if __name__ == "__main__":
    main()
