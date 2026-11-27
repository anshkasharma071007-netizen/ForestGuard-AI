"""Separate saved alert locations from citizen onboarding locations.

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE citizens ADD COLUMN alert_village_id INTEGER "
               "CONSTRAINT fk_citizen_alert_village REFERENCES villages(id)")
    op.add_column("citizens", sa.Column("alert_lat", sa.Float()))
    op.add_column("citizens", sa.Column("alert_lon", sa.Float()))
    op.execute("UPDATE citizens SET alert_village_id = village_id, alert_lat = lat, alert_lon = lon")


def downgrade():
    op.drop_column("citizens", "alert_village_id")
    op.drop_column("citizens", "alert_lat")
    op.drop_column("citizens", "alert_lon")
