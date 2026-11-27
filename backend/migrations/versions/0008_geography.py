"""Add jurisdiction routing and public alert geography.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "camera_uploads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("camera_id", sa.Integer(), sa.ForeignKey("cameras.id"), nullable=False),
        sa.Column("image_path", sa.String(255), nullable=False),
        sa.Column("annotated_path", sa.String(255)),
    )
    op.create_index("ix_camera_uploads_camera_id", "camera_uploads", ["camera_id"])
    op.create_table(
        "jurisdictions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("boundary", sa.JSON(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "authority_jurisdictions",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("jurisdiction_id", sa.Integer(), sa.ForeignKey("jurisdictions.id", ondelete="CASCADE"),
                  primary_key=True),
    )
    op.create_index("ix_authority_jurisdictions_jurisdiction_id", "authority_jurisdictions", ["jurisdiction_id"])
    if op.get_bind().dialect.name == "sqlite":
        op.execute("ALTER TABLE sighting_reports ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id)")
    else:
        op.add_column("sighting_reports", sa.Column("jurisdiction_id", sa.Integer()))
        op.create_foreign_key("fk_report_jurisdiction", "sighting_reports", "jurisdictions", ["jurisdiction_id"], ["id"])
    op.create_index("ix_sighting_reports_jurisdiction_id", "sighting_reports", ["jurisdiction_id"])
    op.execute("""
        ALTER TABLE citizens ADD COLUMN alert_radius_km INTEGER NOT NULL DEFAULT 25
        CONSTRAINT ck_citizen_alert_radius CHECK (alert_radius_km IN (5, 10, 20, 25))
    """)
    op.add_column("alerts", sa.Column("public_lat", sa.Float()))
    op.add_column("alerts", sa.Column("public_lon", sa.Float()))
    # Maintain the existing public precision for village centers and GPS reports.
    op.execute("""
        UPDATE alerts SET
          public_lat = (SELECT CASE WHEN v.lat BETWEEN -90 AND 90 AND v.lon BETWEEN -180 AND 180
                                THEN round(CAST(v.lat AS numeric), 2) ELSE round(CAST(i.lat AS numeric), 1) END
                        FROM incidents i LEFT JOIN villages v ON v.id = i.village_id WHERE i.id = alerts.incident_id),
          public_lon = (SELECT CASE WHEN v.lat BETWEEN -90 AND 90 AND v.lon BETWEEN -180 AND 180
                                THEN round(CAST(v.lon AS numeric), 2) ELSE round(CAST(i.lon AS numeric), 1) END
                        FROM incidents i LEFT JOIN villages v ON v.id = i.village_id WHERE i.id = alerts.incident_id)
        WHERE incident_id IN (SELECT id FROM incidents WHERE verified
                              AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180)
    """)
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    schema = bind.scalar(sa.text("""
        SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'postgis'
    """))
    if not schema:
        raise RuntimeError("Enable PostGIS in the target database before applying revision 0008.")
    postgis = bind.dialect.identifier_preparer.quote_schema(schema)
    op.execute(f"""
        ALTER TABLE jurisdictions ADD COLUMN boundary_geom {postgis}.geometry(MultiPolygon,4326)
        GENERATED ALWAYS AS ({postgis}.ST_Multi({postgis}.ST_Force2D({postgis}.ST_SetSRID(
            {postgis}.ST_GeomFromGeoJSON(boundary::text),4326)))) STORED
    """)
    op.execute(f"""
        ALTER TABLE incidents ADD COLUMN incident_point {postgis}.geometry(Point,4326)
        GENERATED ALWAYS AS (CASE WHEN lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
            THEN {postgis}.ST_SetSRID({postgis}.ST_MakePoint(lon,lat),4326) END) STORED
    """)
    op.execute(f"""
        ALTER TABLE alerts ADD COLUMN public_point {postgis}.geography(Point,4326)
        GENERATED ALWAYS AS ({postgis}.ST_SetSRID({postgis}.ST_MakePoint(public_lon,public_lat),4326)
                             ::{postgis}.geography) STORED
    """)
    op.execute("CREATE INDEX ix_jurisdictions_boundary_geom ON jurisdictions USING gist (boundary_geom)")
    op.execute("CREATE INDEX ix_incidents_incident_point ON incidents USING gist (incident_point)")
    op.execute("CREATE INDEX ix_alerts_public_point ON alerts USING gist (public_point)")


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.drop_column("alerts", "public_point")
        op.drop_column("incidents", "incident_point")
        op.drop_column("jurisdictions", "boundary_geom")
    op.drop_column("alerts", "public_lon")
    op.drop_column("alerts", "public_lat")
    op.drop_column("citizens", "alert_radius_km")
    op.drop_index("ix_sighting_reports_jurisdiction_id", table_name="sighting_reports")
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_report_jurisdiction", "sighting_reports", type_="foreignkey")
    op.drop_column("sighting_reports", "jurisdiction_id")
    op.drop_table("authority_jurisdictions")
    op.drop_table("jurisdictions")
    op.drop_table("camera_uploads")
