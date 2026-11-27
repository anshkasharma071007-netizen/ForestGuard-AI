"""Provision only development authority demo users in the configured database."""

import argparse
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="Load private backend connection settings from this file")
    args = parser.parse_args()
    if args.env_file:
        if not args.env_file.is_file():
            parser.error("The specified environment file does not exist.")
        os.environ["FOREST_GUARD_ENV_FILE"] = str(args.env_file)

    from backend import config
    from backend.database.session import SessionLocal, validate_runtime_database
    from backend.services.authority_demo import DEMO_ACCOUNTS, provision_authority_demo_accounts

    if not config.authority_demo_accounts_allowed():
        parser.exit(1, "Set APP_ENV=development and AUTHORITY_DEMO_ACCOUNTS_ENABLED=true to provision demo accounts.\n")
    with SessionLocal.begin() as db:
        validate_runtime_database(db)
    with SessionLocal() as db:
        results = provision_authority_demo_accounts(db)
    for role, result in results.items():
        print(f"{DEMO_ACCOUNTS[role]['email']}: {result}")


if __name__ == "__main__":
    main()
