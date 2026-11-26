"""Forest Guard baseline

Revision ID: 0001
Revises:
Create Date: 2026-11-26 19:42:38.579354

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('cameras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('zone', sa.String(length=80), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('last_seen', sa.DateTime(), nullable=True),
        sa.Column('installed_on', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cameras_code'), 'cameras', ['code'], unique=True)
    op.create_index(op.f('ix_cameras_zone'), 'cameras', ['zone'], unique=False)
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=180), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('badge_id', sa.String(length=40), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)
    op.create_table('villages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('district', sa.String(length=120), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('population', sa.Integer(), nullable=False),
        sa.Column('households', sa.Integer(), nullable=False),
        sa.Column('boundary_geojson', sa.JSON(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('last_alert_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_villages_name'), 'villages', ['name'], unique=False)
    op.create_table('guards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('badge_id', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('phone', sa.String(length=40), nullable=True),
        sa.Column('zone', sa.String(length=80), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('badge_id')
    )
    op.create_table('incidents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=60), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('village_id', sa.Integer(), nullable=True),
        sa.Column('species', sa.String(length=40), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('verified', sa.Boolean(), nullable=False),
        sa.Column('reported_by', sa.String(length=120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('image_path', sa.String(length=255), nullable=True),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['village_id'], ['villages.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incidents_category'), 'incidents', ['category'], unique=False)
    op.create_index(op.f('ix_incidents_created_at'), 'incidents', ['created_at'], unique=False)
    op.create_table('sighting_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference_code', sa.String(length=30), nullable=False),
        sa.Column('category', sa.String(length=30), nullable=False),
        sa.Column('species', sa.String(length=40), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lon', sa.Float(), nullable=True),
        sa.Column('village_id', sa.Integer(), nullable=True),
        sa.Column('reporter_name', sa.String(length=120), nullable=False),
        sa.Column('contact', sa.String(length=80), nullable=True),
        sa.Column('image_path', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['village_id'], ['villages.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sighting_reports_created_at'), 'sighting_reports', ['created_at'], unique=False)
    op.create_index(op.f('ix_sighting_reports_reference_code'), 'sighting_reports', ['reference_code'], unique=True)
    op.create_table('tracks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('species', sa.String(length=40), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=False),
        sa.Column('point_count', sa.Integer(), nullable=False),
        sa.Column('path_geojson', sa.JSON(), nullable=False),
        sa.Column('distance_km', sa.Float(), nullable=False),
        sa.Column('direction', sa.String(length=30), nullable=False),
        sa.Column('nearest_village_id', sa.Integer(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.Column('method', sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(['nearest_village_id'], ['villages.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tracks_species'), 'tracks', ['species'], unique=False)
    op.create_table('detections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('species', sa.String(length=40), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('species_confidence', sa.Float(), nullable=True),
        sa.Column('detector_confidence', sa.Float(), nullable=True),
        sa.Column('detected_at', sa.DateTime(), nullable=False),
        sa.Column('camera_id', sa.Integer(), nullable=True),
        sa.Column('camera_code', sa.String(length=40), nullable=True),
        sa.Column('zone', sa.String(length=80), nullable=True),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('image_path', sa.String(length=255), nullable=True),
        sa.Column('annotated_path', sa.String(length=255), nullable=True),
        sa.Column('bbox', sa.JSON(), nullable=True),
        sa.Column('source_type', sa.String(length=30), nullable=False),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.Column('track_id', sa.Integer(), nullable=True),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('risk_basis', sa.String(length=40), nullable=True),
        sa.Column('risk_components', sa.JSON(), nullable=True),
        sa.Column('nearest_village_id', sa.Integer(), nullable=True),
        sa.Column('observed_distance_km', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id']),
        sa.ForeignKeyConstraint(['nearest_village_id'], ['villages.id']),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_detections_detected_at'), 'detections', ['detected_at'], unique=False)
    op.create_index(op.f('ix_detections_lat'), 'detections', ['lat'], unique=False)
    op.create_index(op.f('ix_detections_lon'), 'detections', ['lon'], unique=False)
    op.create_index(op.f('ix_detections_risk_level'), 'detections', ['risk_level'], unique=False)
    op.create_index(op.f('ix_detections_risk_score'), 'detections', ['risk_score'], unique=False)
    op.create_index(op.f('ix_detections_species'), 'detections', ['species'], unique=False)
    op.create_table('alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('detection_id', sa.Integer(), nullable=True),
        sa.Column('species', sa.String(length=40), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('risk_basis', sa.String(length=40), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('village_ids', sa.JSON(), nullable=False),
        sa.Column('radius_km', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('priority_rank', sa.Integer(), nullable=False),
        sa.Column('assigned_guard_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('public_summary', sa.Text(), nullable=True),
        sa.Column('is_simulated', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['assigned_guard_id'], ['guards.id']),
        sa.ForeignKeyConstraint(['detection_id'], ['detections.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alerts_created_at'), 'alerts', ['created_at'], unique=False)
    op.create_index(op.f('ix_alerts_severity'), 'alerts', ['severity'], unique=False)
    op.create_index(op.f('ix_alerts_status'), 'alerts', ['status'], unique=False)
    op.create_table('alert_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('alert_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=30), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('actor', sa.String(length=120), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['alert_id'], ['alerts.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alert_events_alert_id'), 'alert_events', ['alert_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_alert_events_alert_id'), table_name='alert_events')
    op.drop_table('alert_events')
    op.drop_index(op.f('ix_alerts_status'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_severity'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_created_at'), table_name='alerts')
    op.drop_table('alerts')
    op.drop_index(op.f('ix_detections_species'), table_name='detections')
    op.drop_index(op.f('ix_detections_risk_score'), table_name='detections')
    op.drop_index(op.f('ix_detections_risk_level'), table_name='detections')
    op.drop_index(op.f('ix_detections_lon'), table_name='detections')
    op.drop_index(op.f('ix_detections_lat'), table_name='detections')
    op.drop_index(op.f('ix_detections_detected_at'), table_name='detections')
    op.drop_table('detections')
    op.drop_index(op.f('ix_tracks_species'), table_name='tracks')
    op.drop_table('tracks')
    op.drop_index(op.f('ix_sighting_reports_reference_code'), table_name='sighting_reports')
    op.drop_index(op.f('ix_sighting_reports_created_at'), table_name='sighting_reports')
    op.drop_table('sighting_reports')
    op.drop_index(op.f('ix_incidents_created_at'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_category'), table_name='incidents')
    op.drop_table('incidents')
    op.drop_table('guards')
    op.drop_index(op.f('ix_villages_name'), table_name='villages')
    op.drop_table('villages')
    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_cameras_zone'), table_name='cameras')
    op.drop_index(op.f('ix_cameras_code'), table_name='cameras')
    op.drop_table('cameras')
