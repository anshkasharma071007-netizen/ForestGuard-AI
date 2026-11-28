"""Provision the development Greater Noida Range Officer."""

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
    from tools.provision_greater_noida import main as provision

    if not config.authority_demo_accounts_allowed():
        parser.exit(1, "Set APP_ENV=development and AUTHORITY_DEMO_ACCOUNTS_ENABLED=true to provision the demo.\n")
    provision()


if __name__ == "__main__":
    main()
