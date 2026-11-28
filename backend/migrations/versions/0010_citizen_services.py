"""Add email verification, selected location labels, and citizen push delivery.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "sqlite":
        if op.get_bind().dialect.server_version_info < (3, 53):
            raise RuntimeError("Revision 0010 needs SQLite 3.53+ for an in-place constraint change. Use PostgreSQL or upgrade SQLite.")
        # Alter the constraint in place so referencing rows remain intact.
        op.execute("ALTER TABLE citizens ALTER COLUMN phone DROP NOT NULL")
    else:
        op.alter_column("citizens", "phone", existing_type=sa.String(16), nullable=True)
    op.add_column("citizens", sa.Column("login_email", sa.String(254)))
    op.add_column("citizens", sa.Column("email_verified_at", sa.DateTime()))
    op.add_column("citizens", sa.Column("contact_phone", sa.String(16)))
    op.add_column("citizens", sa.Column("location_label", sa.String(250)))
    op.add_column("citizens", sa.Column("alert_location_label", sa.String(250)))
    op.add_column("citizens", sa.Column("push_reports", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("citizens", sa.Column("push_nearby", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("uq_citizens_login_email", "citizens", ["login_email"], unique=True)
    op.execute("UPDATE citizens SET contact_phone = phone")
    op.add_column("sighting_reports", sa.Column("location_label", sa.String(250)))
    op.add_column("citizen_sessions", sa.Column("auth_method", sa.String(8), nullable=False, server_default="legacy"))
    op.create_table(
        "citizen_otps",
        sa.Column("email_key", sa.String(64), primary_key=True),
        sa.Column("challenge", sa.String(32), nullable=False),
        sa.Column("digest", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("delivered", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_citizen_otps_expires_at", "citizen_otps", ["expires_at"])
    op.create_table(
        "citizen_otp_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window_start", sa.DateTime(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
    )
    op.create_index("ix_citizen_otp_limits_window_start", "citizen_otp_limits", ["window_start"])
    op.create_table(
        "citizen_push_devices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("installation", sa.String(36), nullable=False, unique=True),
        sa.Column("token", sa.String(200), nullable=False, unique=True),
        sa.Column("session_hash", sa.String(64),
                  sa.ForeignKey("citizen_sessions.token_hash", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_citizen_push_devices_session_hash", "citizen_push_devices", ["session_hash"])
    op.create_table(
        "citizen_push_deliveries",
        sa.Column("device_id", sa.String(36), sa.ForeignKey("citizen_push_devices.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("event_key", sa.String(50), primary_key=True),
        sa.Column("notification_id", sa.String(36), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("next_at", sa.DateTime()),
        sa.Column("ticket", sa.String(100)),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )
    op.create_index("ix_citizen_push_deliveries_due", "citizen_push_deliveries", ["next_at"])
    if op.get_bind().dialect.name == "postgresql":
        protected = ("citizen_otps, citizen_otp_limits, citizen_push_devices, citizen_push_deliveries")
        op.execute(f"REVOKE ALL ON {protected} FROM PUBLIC")
        for role in ("anon", "authenticated", "service_role"):
            if op.get_bind().execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}).scalar():
                op.execute(f"REVOKE ALL ON {protected} FROM {role}")


def downgrade():
    if op.get_bind().execute(sa.text("SELECT 1 FROM citizens WHERE phone IS NULL LIMIT 1")).first():
        raise RuntimeError("Revision 0009 cannot represent email-only citizen accounts. Restore a pre-upgrade backup to roll back.")
    for table in ("citizen_push_deliveries", "citizen_push_devices", "citizen_otp_limits", "citizen_otps"):
        op.drop_table(table)
    op.drop_column("citizen_sessions", "auth_method")
    op.drop_column("sighting_reports", "location_label")
    op.drop_index("uq_citizens_login_email", table_name="citizens")
    for column in ("push_nearby", "push_reports", "alert_location_label", "location_label",
                   "contact_phone", "email_verified_at", "login_email"):
        op.drop_column("citizens", column)
    if op.get_bind().dialect.name == "sqlite":
        op.execute("ALTER TABLE citizens ALTER COLUMN phone SET NOT NULL")
    else:
        op.alter_column("citizens", "phone", existing_type=sa.String(16), nullable=False)
