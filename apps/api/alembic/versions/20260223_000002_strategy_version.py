"""Add strategy version column

Revision ID: 20260223_000002
Revises: 20260223_000001
Create Date: 2026-02-23 03:50:00

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260223_000002"
down_revision: Union[str, Sequence[str], None] = "20260223_000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "strategies",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.drop_index("ix_strategies_name", table_name="strategies")
    op.create_index("ix_strategies_name", "strategies", ["name"], unique=False)
    op.create_index("ix_strategies_name_version", "strategies", ["name", "version"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_strategies_name_version", table_name="strategies")
    op.drop_index("ix_strategies_name", table_name="strategies")
    op.create_index("ix_strategies_name", "strategies", ["name"], unique=True)
    op.drop_column("strategies", "version")
