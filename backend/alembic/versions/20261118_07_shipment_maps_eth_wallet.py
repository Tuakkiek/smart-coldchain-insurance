"""Add Google Maps location metadata, SepoliaETH insurance units, buyer wallet, and policy tracking to shipments.

Revision ID: 20261118_07
Revises: 20261117_06

Legacy rows preserve insured_amount_vnd with insurance_currency='VND' and are
never mechanically converted to ETH or Wei.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20261118_07"
down_revision = "20261117_06"
branch_labels = None
depends_on = None

UTC_DATETIME = sa.DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql")

NEW_COLUMNS = [
    ("origin_formatted_address", sa.String(500), True, None),
    ("origin_place_id", sa.String(255), True, None),
    ("destination_formatted_address", sa.String(500), True, None),
    ("destination_place_id", sa.String(255), True, None),
    ("insurance_amount", sa.String(78), True, None),
    ("insurance_amount_wei", sa.String(78), True, None),
    ("insurance_currency", sa.String(32), False, "VND"),
    ("blockchain_chain_id", sa.Integer(), True, None),
    ("buyer_wallet_address", sa.String(42), True, None),
    ("policy_contract_address", sa.String(42), True, None),
    ("policy_transaction_hash", sa.String(66), True, None),
    ("policy_status", sa.String(32), True, None),
    ("policy_last_error", sa.String(255), True, None),
    ("policy_expiry", UTC_DATETIME, True, None),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("shipments")}

    for name, col_type, nullable, server_default in NEW_COLUMNS:
        if name not in existing:
            op.add_column(
                "shipments",
                sa.Column(name, col_type, nullable=nullable, server_default=server_default),
            )

    if bind.dialect.name == "mysql":
        op.alter_column(
            "shipments",
            "origin_name",
            existing_type=sa.String(100),
            type_=sa.String(255),
            existing_nullable=False,
        )
        op.alter_column(
            "shipments",
            "destination_name",
            existing_type=sa.String(100),
            type_=sa.String(255),
            existing_nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {col["name"] for col in inspector.get_columns("shipments")}

    for name, _col_type, _nullable, _server_default in reversed(NEW_COLUMNS):
        if name in existing:
            op.drop_column("shipments", name)
