"""Persist sealed Merkle batches and durable anchor outbox records.

Revision ID: 20261109_02
Revises: 20261105_01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20261109_02"
down_revision = "20261105_01"
branch_labels = None
depends_on = None


def _utc_datetime():
    return sa.DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.create_table(
        "integrity_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("shipment_id", sa.String(36), sa.ForeignKey("shipments.id"), nullable=False),
        sa.Column("device_id", sa.String(100), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("first_sequence", sa.BigInteger, nullable=False),
        sa.Column("last_sequence", sa.BigInteger, nullable=False),
        sa.Column("record_count", sa.Integer, nullable=False),
        sa.Column("merkle_root", sa.String(64), nullable=False),
        sa.Column("hash_version", sa.String(16), nullable=False),
        sa.Column("verification_status", sa.String(32), nullable=False),
        sa.Column("anchor_status", sa.String(32), nullable=False),
        sa.Column("sealed_at", _utc_datetime(), nullable=False),
        sa.Column("verified_at", _utc_datetime()),
    )
    op.create_index(
        "ix_integrity_batches_shipment", "integrity_batches", ["shipment_id", "sealed_at", "id"]
    )
    op.create_index(
        "ix_integrity_batches_anchor", "integrity_batches", ["anchor_status", "sealed_at"]
    )
    op.create_table(
        "integrity_batch_items",
        sa.Column("batch_id", sa.String(36), sa.ForeignKey("integrity_batches.id"), primary_key=True),
        sa.Column("telemetry_id", sa.String(36), sa.ForeignKey("telemetry.id"), primary_key=True),
        sa.Column("leaf_index", sa.Integer, nullable=False),
        sa.Column("leaf_hash", sa.String(64), nullable=False),
        sa.Column("sequence_number", sa.BigInteger, nullable=False),
        sa.UniqueConstraint("batch_id", "leaf_index", name="uq_integrity_batch_leaf_index"),
        sa.UniqueConstraint("telemetry_id", name="uq_integrity_batch_telemetry"),
    )
    op.create_table(
        "integration_outbox",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("aggregate_id", sa.String(36), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("attempt_count", sa.Integer, nullable=False),
        sa.Column("available_at", _utc_datetime(), nullable=False),
        sa.Column("last_error", sa.String(200)),
        sa.Column("created_at", _utc_datetime(), nullable=False),
        sa.Column("updated_at", _utc_datetime(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_integration_outbox_idempotency"),
    )
    op.create_index(
        "ix_integration_outbox_ready", "integration_outbox", ["status", "available_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_integration_outbox_ready", table_name="integration_outbox")
    op.drop_table("integration_outbox")
    op.drop_table("integrity_batch_items")
    op.drop_index("ix_integrity_batches_anchor", table_name="integrity_batches")
    op.drop_index("ix_integrity_batches_shipment", table_name="integrity_batches")
    op.drop_table("integrity_batches")
