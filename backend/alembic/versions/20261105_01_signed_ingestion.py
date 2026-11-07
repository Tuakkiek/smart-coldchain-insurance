"""Add device identities, signed telemetry receipts and rejection audit.

Revision ID: 20261105_01
Revises:
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20261105_01"
down_revision = None
branch_labels = None
depends_on = None


def _utc_datetime():
    return sa.DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("last_sequence_number", sa.BigInteger, nullable=False),
        sa.Column("last_seen_at", _utc_datetime()),
        sa.Column("rate_window_started_at", _utc_datetime()),
        sa.Column("rate_window_count", sa.Integer, nullable=False),
        sa.Column("created_at", _utc_datetime(), nullable=False),
    )
    op.create_table(
        "device_keys",
        sa.Column("device_id", sa.String(100), sa.ForeignKey("devices.id"), primary_key=True),
        sa.Column("key_id", sa.String(100), primary_key=True),
        sa.Column("public_key_pem", sa.String(512), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", _utc_datetime(), nullable=False),
    )
    op.create_table(
        "device_assignments",
        sa.Column("device_id", sa.String(100), sa.ForeignKey("devices.id"), primary_key=True),
        sa.Column("shipment_id", sa.String(36), sa.ForeignKey("shipments.id"), primary_key=True),
        sa.Column("active", sa.Boolean, nullable=False),
    )
    op.create_table(
        "signed_telemetry_receipts",
        sa.Column("telemetry_id", sa.String(36), sa.ForeignKey("telemetry.id"), primary_key=True),
        sa.Column("shipment_id", sa.String(36), sa.ForeignKey("shipments.id"), nullable=False),
        sa.Column("device_id", sa.String(100), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("key_id", sa.String(100), nullable=False),
        sa.Column("sequence_number", sa.BigInteger, nullable=False),
        sa.Column("payload_version", sa.Integer, nullable=False),
        sa.Column("firmware_version", sa.String(64), nullable=False),
        sa.Column("temperature_milli_c", sa.Integer, nullable=False),
        sa.Column("humidity_milli_pct", sa.Integer, nullable=False),
        sa.Column("signature", sa.String(128), nullable=False),
        sa.Column("canonical_sha256", sa.String(64), nullable=False),
        sa.Column("missing_from", sa.BigInteger),
        sa.Column("missing_to", sa.BigInteger),
        sa.UniqueConstraint("device_id", "sequence_number", name="uq_signed_device_sequence"),
    )
    op.create_index("ix_signed_receipts_shipment", "signed_telemetry_receipts", ["shipment_id", "sequence_number"])
    op.create_table(
        "ingestion_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("shipment_id", sa.String(36)),
        sa.Column("device_id", sa.String(100)),
        sa.Column("sequence_number", sa.BigInteger),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("received_at", _utc_datetime(), nullable=False),
    )
    op.create_index("ix_ingestion_audit_received", "ingestion_audit", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_ingestion_audit_received", table_name="ingestion_audit")
    op.drop_table("ingestion_audit")
    op.drop_index("ix_signed_receipts_shipment", table_name="signed_telemetry_receipts")
    op.drop_table("signed_telemetry_receipts")
    op.drop_table("device_assignments")
    op.drop_table("device_keys")
    op.drop_table("devices")
