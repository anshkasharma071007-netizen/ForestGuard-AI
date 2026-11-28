"""Development sign-in for the existing Greater Noida Range Officer."""

from sqlalchemy import select

from backend import config
from backend.models import User
from backend.models.entities import AuthorityJurisdiction, Jurisdiction

GREATER_NOIDA_EMAIL = "greater-noida-officer@example.com"
GREATER_NOIDA_NAME = "Greater Noida (approximate development jurisdiction)"

# Keep the old published passwords development-only for existing installations.
_LEGACY_DEMO = {
    "admin@forestguard.ai": ("admin", "Admin@123"),
    "guard@forestguard.ai": ("guard", "Guard@123"),
}


def demo_role_for_credentials(email: str, password: str) -> str | None:
    account = _LEGACY_DEMO.get(email)
    return account[0] if account and account[1] == password else None


def greater_noida_officer(db):
    if not config.authority_demo_accounts_allowed():
        return None
    officer = db.scalar(select(User).where(User.email == GREATER_NOIDA_EMAIL, User.role == "range_officer"))
    if officer is None:
        return None
    assignments = db.scalars(select(Jurisdiction).join(AuthorityJurisdiction).where(
        AuthorityJurisdiction.user_id == officer.id)).all()
    if len(assignments) == 1 and assignments[0].name == GREATER_NOIDA_NAME and not assignments[0].is_demo:
        return officer
    return None
