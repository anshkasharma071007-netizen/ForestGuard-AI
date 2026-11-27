"""Opt-in development authority accounts, independent of operational demo data."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from backend import config
from backend.api.deps import hash_password, verify_password
from backend.models import User

DEMO_ACCOUNTS = {
    "admin": {"name": "Range Officer", "email": "admin@forestguard.ai", "password": "Admin@123"},
    "guard": {"name": "Forest Guard", "email": "guard@forestguard.ai", "password": "Guard@123"},
}


def demo_role_for_credentials(email: str, password: str) -> str | None:
    return next(
        (role for role, account in DEMO_ACCOUNTS.items()
         if email == account["email"] and password == account["password"]),
        None,
    )


def provision_authority_demo_accounts(db: Session) -> dict[str, str]:
    """Return the disposition of each account in a fresh session."""
    if not config.authority_demo_accounts_allowed():
        return {}

    insert = postgres_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    results = {}
    with db.begin():
        for role, account in DEMO_ACCOUNTS.items():
            email = account["email"]
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                statement = (
                    insert(User)
                    .values(name=account["name"], email=email, role=role,
                            password_hash=hash_password(account["password"]))
                    .on_conflict_do_nothing(index_elements=[User.email])
                    .returning(User.id)
                )
                if db.scalar(statement) is not None:
                    results[role] = "created"
                    continue
                user = db.scalar(select(User).where(User.email == email))
            if user and user.role == role and verify_password(account["password"], user.password_hash):
                results[role] = "already provisioned"
            else:
                results[role] = "preserved existing account with different credentials or role"
    return results
