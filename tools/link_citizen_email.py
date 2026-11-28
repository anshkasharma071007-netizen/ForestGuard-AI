"""Reserve a verified-in-person email for an existing citizen ID."""

import argparse
from getpass import getpass

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError

from backend.database.session import SessionLocal, validate_runtime_database
from backend.models.entities import Citizen
from backend.services.citizen_email import normalize_email
from backend.services.incident_lifecycle import lock_record


def link(db, citizen_id: int, email: str):
    citizen = lock_record(db, Citizen, citizen_id)
    if citizen.login_email == email:
        return
    if citizen.email_verified_at is not None:
        raise ValueError("This citizen already has a verified sign-in address.")
    citizen.login_email = email
    db.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("citizen_id", type=int)
    parser.add_argument("--identity-verified", action="store_true", required=True,
                        help="Confirm that you independently verified the citizen's ownership of the legacy account.")
    args = parser.parse_args()
    try:
        email = normalize_email(TypeAdapter(EmailStr).validate_python(getpass("New sign-in email: ")))
        with SessionLocal.begin() as db:
            validate_runtime_database(db)
            link(db, args.citizen_id, email)
    except ValidationError:
        raise SystemExit("Enter a valid email address.") from None
    except IntegrityError:
        raise SystemExit("That address already belongs to another account. Review both accounts manually.") from None
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print(f"Email reserved for citizen {args.citizen_id}. The citizen must verify it using email OTP.")


if __name__ == "__main__":
    main()
