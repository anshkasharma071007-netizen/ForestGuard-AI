"""Add citizen accounts, sessions and report ownership."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "citizens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone", sa.String(16), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254)),
        sa.Column("village_id", sa.Integer(), sa.ForeignKey("villages.id")),
        sa.Column("lat", sa.Float()),
        sa.Column("lon", sa.Float()),
    )
    op.create_table(
        "citizen_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("citizen_id", sa.Integer(), sa.ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_citizen_sessions_citizen_id", "citizen_sessions", ["citizen_id"])
    # SQLite supports ADD COLUMN with a nullable REFERENCES clause directly.
    op.execute("ALTER TABLE sighting_reports ADD COLUMN citizen_id INTEGER REFERENCES citizens (id)")
    op.add_column("sighting_reports", sa.Column("title", sa.String(120)))
    op.create_index("ix_sighting_reports_citizen_id", "sighting_reports", ["citizen_id"])


def downgrade():
    op.drop_index("ix_sighting_reports_citizen_id", table_name="sighting_reports")
    op.drop_column("sighting_reports", "title")
    op.drop_column("sighting_reports", "citizen_id")
    op.drop_table("citizen_sessions")
    op.drop_table("citizens")
