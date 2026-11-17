"""Persist the single Admin account; bootstrap credentials are not migration data.

Revision ID: 20261116_04
Revises: 20261115_03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "20261116_04"
down_revision = "20261115_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_admin_accounts_singleton"),
        sa.UniqueConstraint("username", name="uq_admin_accounts_username"),
    )


def downgrade() -> None:
    op.drop_table("admin_accounts")
