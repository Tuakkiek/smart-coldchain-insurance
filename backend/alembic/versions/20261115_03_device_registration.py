"""Separate device registration from provisioning and enforce one active shipment.

Revision ID: 20261115_03
Revises: 20261109_02
"""

from alembic import op
import sqlalchemy as sa


revision = "20261115_03"
down_revision = "20261109_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    assignments = sa.table(
        "device_assignments", sa.column("device_id"), sa.column("active", sa.Boolean),
    )
    conflicts = list(connection.scalars(
        sa.select(assignments.c.device_id).where(assignments.c.active.is_(True))
        .group_by(assignments.c.device_id).having(sa.func.count() > 1)
        .order_by(assignments.c.device_id)
    ))
    # MySQL DDL commits implicitly: validate before changing any schema/data.
    if conflicts:
        raise RuntimeError(
            "Multiple active shipment assignments for device(s): " + ", ".join(conflicts)
            + ". Choose the correct assignment and deactivate the others before retrying."
        )

    if connection.dialect.name == "sqlite":
        # SQLite cannot ALTER nullability without rebuilding a referenced parent.
        # A temporary-compatible default permits an additive, FK-safe backfill.
        op.add_column("devices", sa.Column("device_name", sa.String(100), nullable=False, server_default=""))
    else:
        op.add_column("devices", sa.Column("device_name", sa.String(100), nullable=True))
    devices = sa.table("devices", sa.column("id"), sa.column("device_name"))
    connection.execute(devices.update().values(device_name=devices.c.id))
    if connection.dialect.name != "sqlite":
        op.alter_column("devices", "device_name", existing_type=sa.String(100), nullable=False)

    op.add_column("device_assignments", sa.Column(
        "active_device_id", sa.String(100),
        sa.Computed("CASE WHEN active THEN device_id ELSE NULL END", persisted=False),
        nullable=True,
    ))
    op.create_index("uq_device_assignment_active", "device_assignments", ["active_device_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_device_assignment_active", table_name="device_assignments")
    op.drop_column("device_assignments", "active_device_id")
    op.drop_column("devices", "device_name")
