"""Retain incident resolution attribution and deployment risk settings."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("resolved_by", sa.String(120)))
    op.add_column("incidents", sa.Column("resolved_by_id", sa.Integer()))
    op.add_column("incidents", sa.Column("resolution_note", sa.Text()))
    op.create_table(
        "risk_configuration",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_risk_configuration_singleton"),
    )


def downgrade():
    op.drop_table("risk_configuration")
    for column in ("resolution_note", "resolved_by_id", "resolved_by"):
        op.drop_column("incidents", column)
