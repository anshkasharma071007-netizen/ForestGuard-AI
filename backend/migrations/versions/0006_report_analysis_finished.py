"""Record when report photo analysis finishes."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sighting_reports", sa.Column("analysis_finished_at", sa.DateTime()))


def downgrade():
    op.drop_column("sighting_reports", "analysis_finished_at")
