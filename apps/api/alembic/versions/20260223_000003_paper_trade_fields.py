"""Phase 2 paper trade and order fields

Revision ID: 20260223_000003
Revises: 20260223_000002
Create Date: 2026-02-23 04:20:00

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260223_000003"
down_revision: Union[str, Sequence[str], None] = "20260223_000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("trades", "bot_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("trades", sa.Column("cost_basis_quote", sa.Float(), nullable=False, server_default="0"))
    op.add_column("trades", sa.Column("fees_paid_quote", sa.Float(), nullable=False, server_default="0"))
    op.add_column("trades", sa.Column("unrealized_pnl_quote", sa.Float(), nullable=True))
    op.add_column("trades", sa.Column("realized_pnl_quote", sa.Float(), nullable=True))
    op.add_column("trades", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("orders", sa.Column("bot_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("quote_amount", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("base_qty", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("fee_quote", sa.Float(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("paper_mode", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.alter_column("orders", "trade_id", existing_type=sa.Integer(), nullable=True)
    op.create_foreign_key("fk_orders_bot_id_bots", "orders", "bots", ["bot_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_orders_bot_id", "orders", ["bot_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_orders_bot_id", table_name="orders")
    op.drop_constraint("fk_orders_bot_id_bots", "orders", type_="foreignkey")
    op.alter_column("orders", "trade_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("orders", "paper_mode")
    op.drop_column("orders", "fee_quote")
    op.drop_column("orders", "base_qty")
    op.drop_column("orders", "quote_amount")
    op.drop_column("orders", "bot_id")

    op.drop_column("trades", "closed_at")
    op.drop_column("trades", "realized_pnl_quote")
    op.drop_column("trades", "unrealized_pnl_quote")
    op.drop_column("trades", "fees_paid_quote")
    op.drop_column("trades", "cost_basis_quote")
    op.alter_column("trades", "bot_id", existing_type=sa.Integer(), nullable=False)
