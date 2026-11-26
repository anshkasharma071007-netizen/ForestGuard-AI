"""Durable photo jobs, review history, read receipts and verified incident provenance."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("sighting_reports") as batch:
        batch.add_column(sa.Column("submission_key", sa.String(36)))
        batch.create_unique_constraint("uq_report_submission_key", ["submission_key"])
        batch.add_column(sa.Column("submission_digest", sa.String(64)))
        batch.add_column(sa.Column("analysis_status", sa.String(20), server_default="no_photo", nullable=False))
        batch.create_index("ix_sighting_reports_analysis_status", ["analysis_status"])
        batch.add_column(sa.Column("analysis_started_at", sa.DateTime()))
        batch.add_column(sa.Column("analysis_results", sa.JSON()))
        batch.add_column(sa.Column("review_history", sa.JSON()))
    op.execute("UPDATE sighting_reports SET analysis_status='queued' WHERE image_path IS NOT NULL")
    with op.batch_alter_table("incidents") as batch:
        batch.add_column(sa.Column("report_id", sa.Integer()))
        batch.create_foreign_key("fk_incident_report", "sighting_reports", ["report_id"], ["id"])
        batch.create_unique_constraint("uq_incident_report", ["report_id"])
        batch.add_column(sa.Column("report_risk", sa.JSON()))
    with op.batch_alter_table("alerts") as batch:
        batch.add_column(sa.Column("incident_id", sa.Integer()))
        batch.create_foreign_key("fk_alert_incident", "incidents", ["incident_id"], ["id"])
        batch.create_unique_constraint("uq_alert_incident", ["incident_id"])
    op.create_table("report_reads",
                    sa.Column("report_id", sa.Integer(), sa.ForeignKey("sighting_reports.id"), primary_key=True),
                    sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True))


def downgrade():
    op.drop_table("report_reads")
    with op.batch_alter_table("alerts") as batch:
        batch.drop_constraint("uq_alert_incident", type_="unique")
        batch.drop_constraint("fk_alert_incident", type_="foreignkey")
        batch.drop_column("incident_id")
    with op.batch_alter_table("incidents") as batch:
        batch.drop_constraint("uq_incident_report", type_="unique")
        batch.drop_constraint("fk_incident_report", type_="foreignkey")
        batch.drop_column("report_risk")
        batch.drop_column("report_id")
    with op.batch_alter_table("sighting_reports") as batch:
        batch.drop_index("ix_sighting_reports_analysis_status")
        batch.drop_constraint("uq_report_submission_key", type_="unique")
        for name in ("review_history", "analysis_results", "analysis_started_at", "analysis_status",
                     "submission_digest", "submission_key"):
            batch.drop_column(name)
