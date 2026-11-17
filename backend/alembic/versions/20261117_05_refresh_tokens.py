"""Add persisted, rotating refresh-token sessions.

Revision ID: 20261117_05
Revises: 20261116_04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20261117_05"
down_revision = "20261116_04"
branch_labels = None
depends_on = None

UTC_DATETIME = sa.DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    op.add_column(
        "admin_accounts",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "admin_accounts",
        sa.Column("security_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("family_id", sa.String(36), nullable=False),
        sa.Column("admin_account_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("account_snapshot_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", UTC_DATETIME, nullable=False),
        sa.Column("created_at", UTC_DATETIME, nullable=False),
        sa.Column("used_at", UTC_DATETIME),
        sa.Column("revoked_at", UTC_DATETIME),
        sa.Column("revoke_reason", sa.String(32)),
        sa.Column("replaced_by_id", sa.String(36)),
        sa.ForeignKeyConstraint(["admin_account_id"], ["admin_accounts.id"]),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["refresh_tokens.id"]),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_admin_account_id", "refresh_tokens", ["admin_account_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_admin_account_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_column("admin_accounts", "security_version")
    op.drop_column("admin_accounts", "is_active")
