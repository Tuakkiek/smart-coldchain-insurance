"""Replace shipment codes with display names, preserving UUIDs and history.

Revision ID: 20261118_08
Revises: 20261118_07
"""

from alembic import op
import sqlalchemy as sa


revision = "20261118_08"
down_revision = "20261118_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("shipments")}
    # New installations already have name via Base.metadata.create_all().
    if "code" not in columns:
        return
    with op.batch_alter_table(
        "shipments", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"},
    ) as batch:
        for constraint in inspector.get_unique_constraints("shipments"):
            if constraint["column_names"] == ["code"]:
                batch.drop_constraint(constraint["name"] or "uq_shipments_code", type_="unique")
        batch.alter_column(
            "code", new_column_name="name", existing_type=sa.String(64),
            type_=sa.String(255), existing_nullable=False,
        )


def downgrade() -> None:
    # A name can repeat and exceed 64 characters. Do not silently truncate data.
    bind = op.get_bind()
    too_long = bind.execute(sa.text("SELECT COUNT(*) FROM shipments WHERE LENGTH(name) > 64")).scalar()
    duplicate = bind.execute(sa.text(
        "SELECT name FROM shipments GROUP BY name HAVING COUNT(*) > 1 LIMIT 1"
    )).first()
    if too_long or duplicate:
        raise ValueError("Cannot restore unique codes: shipment names are repeated or longer than 64 characters")
    with op.batch_alter_table("shipments") as batch:
        batch.alter_column(
            "name", new_column_name="code", existing_type=sa.String(255),
            type_=sa.String(64), existing_nullable=False,
        )
        batch.create_unique_constraint("uq_shipments_code", ["code"])
