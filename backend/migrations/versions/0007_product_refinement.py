"""Add citizen lifecycle notifications, authority alert reads and shareable resolution notes."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("citizen_resolution_note", sa.Text()))
    op.create_table(
        "citizen_notifications",
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("sighting_reports.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("event", sa.String(12), primary_key=True),
        sa.Column("citizen_id", sa.Integer(), sa.ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("read_at", sa.DateTime()),
        sa.CheckConstraint("event IN ('approved', 'rejected', 'resolved')", name="ck_citizen_notification_event"),
    )
    op.create_index("ix_citizen_notifications_citizen_id", "citizen_notifications", ["citizen_id"])
    op.create_table(
        "alert_reads",
        sa.Column("alert_id", sa.Integer(), sa.ForeignKey("alerts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade():
    op.drop_table("alert_reads")
    op.drop_index("ix_citizen_notifications_citizen_id", table_name="citizen_notifications")
    op.drop_table("citizen_notifications")
    op.drop_column("incidents", "citizen_resolution_note")
