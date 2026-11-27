"""Provision two explicitly synthetic jurisdictions in an isolated local test database."""
from getpass import getpass

from sqlalchemy import select

from backend import config
from backend.api.deps import hash_password
from backend.api.routes_jurisdictions import JurisdictionInput, add_jurisdiction, replace_assignments
from backend.database.session import SessionLocal, validate_runtime_database
from backend.models import SightingReport, User
from backend.models.entities import Jurisdiction
from backend.services.geography import lock_routing

ZONES = (
    ("Demo Zone A", "demo-range-a@example.com", "range_officer", 79.10, 79.20),
    ("Demo Zone B", "demo-range-b@example.com", "range_officer", 79.20, 79.30),
)


def main():
    if not config.demo_jurisdictions_allowed():
        raise SystemExit("Use an isolated local database named for testing with demo jurisdictions enabled.")
    password = getpass("Password for the demo officers (at least 12 characters): ")
    if not 12 <= len(password) <= 128:
        raise SystemExit("Enter a password with 12 to 128 characters.")
    with SessionLocal.begin() as db:
        validate_runtime_database(db)
        lock_routing(db)
        if (db.scalar(select(Jurisdiction.id).limit(1)) or db.scalar(select(SightingReport.id).limit(1))
                or db.scalar(select(User.id).where(User.email.in_([row[1] for row in ZONES])).limit(1))):
            raise SystemExit("Demo jurisdictions require an isolated database with no jurisdictions or reports.")
        for name, email, role, west, east in ZONES:
            boundary = {"type": "Polygon", "coordinates": [[
                [west, 21.65], [east, 21.65], [east, 21.85], [west, 21.85], [west, 21.65],
            ]]}
            jurisdiction = add_jurisdiction(db, JurisdictionInput(name=name, boundary=boundary), demo=True)
            user = User(name=f"{name} Range Officer", email=email, role=role, password_hash=hash_password(password))
            db.add(user)
            db.flush()
            replace_assignments(db, user, {jurisdiction.id})
    for name, email, *_ in ZONES:
        print(f"{name} (synthetic fixture) · {email}")


if __name__ == "__main__":
    main()
