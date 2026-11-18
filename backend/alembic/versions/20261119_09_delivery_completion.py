"""Persist delivery completion and safe-policy refund state.

Revision ID: 20261119_09
Revises: 20261118_08
"""
from alembic import op
import sqlalchemy as sa

revision = "20261119_09"
down_revision = "20261118_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("shipments")}
    columns = (
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("delivery_source", sa.String(32), nullable=True),
        sa.Column("delivery_result", sa.String(32), nullable=True),
        sa.Column("delivery_result_reason", sa.String(255), nullable=True),
        sa.Column("refund_status", sa.String(32), nullable=True),
        sa.Column("refund_transaction_hash", sa.String(66), nullable=True),
        sa.Column("refunded_amount_wei", sa.String(78), nullable=True),
        sa.Column("refund_recipient_address", sa.String(42), nullable=True),
    )
    for column in columns:
        if column.name not in existing:
            op.add_column("shipments", column)


def downgrade() -> None:
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("shipments")}
    for name in (
        "refund_recipient_address", "refunded_amount_wei", "refund_transaction_hash",
        "refund_status", "delivery_result_reason", "delivery_result", "delivery_source",
        "delivered_at",
    ):
        if name in existing:
            op.drop_column("shipments", name)
