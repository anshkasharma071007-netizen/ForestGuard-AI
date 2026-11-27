"""Create Greater Noida development coverage and assign a development officer."""

from getpass import getpass

from sqlalchemy import select

from backend import config
from backend.api.deps import hash_password
from backend.api.routes_jurisdictions import JurisdictionInput, add_jurisdiction
from backend.database.session import SessionLocal, validate_runtime_database
from backend.models import User
from backend.models.entities import AuthorityJurisdiction, Jurisdiction
from backend.services.geography import lock_routing

NAME = "Greater Noida (approximate development jurisdiction)"
EMAIL = "greater-noida-officer@example.com"
BOUNDARY = {"type": "Polygon", "coordinates": [[
    [77.42, 28.38], [77.62, 28.38], [77.64, 28.57],
    [77.51, 28.62], [77.40, 28.56], [77.42, 28.38],
]]}


def provision(db, password: str | None):
    lock_routing(db)
    jurisdiction = db.scalar(select(Jurisdiction).where(Jurisdiction.name == NAME))
    user = db.scalar(select(User).where(User.email == EMAIL))
    if jurisdiction and (jurisdiction.boundary != BOUNDARY or jurisdiction.is_demo):
        raise ValueError("The existing jurisdiction differs from the configured development boundary.")
    if user and user.role != "range_officer":
        raise ValueError("The development officer email is already in use by a different role.")
    if user is None and (password is None or not 12 <= len(password) <= 72 or len(password.encode()) > 72):
        raise ValueError("Enter a new password of at least 12 characters and at most 72 bytes.")
    if jurisdiction is None:
        # Operational reports use this coverage in development without enabling synthetic data.
        jurisdiction = add_jurisdiction(db, JurisdictionInput(name=NAME, boundary=BOUNDARY, priority=1000))
    if user is None:
        user = User(name="Greater Noida Development Range Officer", email=EMAIL, role="range_officer",
                    password_hash=hash_password(password))
        db.add(user)
        db.flush()
    if db.get(AuthorityJurisdiction, (user.id, jurisdiction.id)) is None:
        db.add(AuthorityJurisdiction(user_id=user.id, jurisdiction_id=jurisdiction.id))
    return jurisdiction.id


def main():
    if config.APP_ENV != "development" or config.demo_jurisdictions_allowed():
        raise SystemExit("Select a private development profile with synthetic jurisdictions disabled.")
    try:
        with SessionLocal.begin() as db:
            validate_runtime_database(db)
            existing = db.scalar(select(User.id).where(User.email == EMAIL))
            password = None if existing else getpass("New Greater Noida development officer password: ")
            identifier = provision(db, password)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print(f"{NAME} ({identifier}) · {EMAIL}")


if __name__ == "__main__":
    main()
