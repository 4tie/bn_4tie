"""Phase 1 initial schema

Revision ID: 20260223_000001
Revises:
Create Date: 2026-02-23 00:00:01

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260223_000001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("symbols", sa.JSON(), nullable=False),
        sa.Column("timeframe", sa.String(length=20), nullable=False),
        sa.Column("paper_mode", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("strategy", sa.String(length=120), nullable=False),
        sa.Column("knobs", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="stopped"),
        sa.Column("stop_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_bots_name", "bots", ["name"], unique=False)
    op.create_index("ix_bots_status", "bots", ["status"], unique=False)
    op.create_index("ix_bots_stop_requested", "bots", ["stop_requested"], unique=False)
    op.create_index("ix_bots_created_at", "bots", ["created_at"], unique=False)

    op.create_table(
        "strategies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_strategies_name", "strategies", ["name"], unique=True)

    op.create_table(
        "trades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=30), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("pnl", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_trades_bot_id", "trades", ["bot_id"], unique=False)
    op.create_index("ix_trades_status", "trades", ["status"], unique=False)
    op.create_index("ix_trades_symbol", "trades", ["symbol"], unique=False)
    op.create_index("ix_trades_created_at", "trades", ["created_at"], unique=False)
    op.create_index("ix_trades_bot_status", "trades", ["bot_id", "status"], unique=False)
    op.create_index("ix_trades_bot_created_at", "trades", ["bot_id", "created_at"], unique=False)

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trade_id", sa.Integer(), nullable=False),
        sa.Column("exchange_id", sa.String(length=128), nullable=True),
        sa.Column("symbol", sa.String(length=30), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["trade_id"], ["trades.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_orders_trade_id", "orders", ["trade_id"], unique=False)
    op.create_index("ix_orders_exchange_id", "orders", ["exchange_id"], unique=False)
    op.create_index("ix_orders_symbol", "orders", ["symbol"], unique=False)
    op.create_index("ix_orders_status", "orders", ["status"], unique=False)
    op.create_index("ix_orders_trade_status", "orders", ["trade_id", "status"], unique=False)
    op.create_index("ix_orders_symbol_status", "orders", ["symbol", "status"], unique=False)

    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=True),
        sa.Column("equity", sa.Float(), nullable=False),
        sa.Column("cash", sa.Float(), nullable=False),
        sa.Column("positions_value", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_portfolio_snapshots_bot_id", "portfolio_snapshots", ["bot_id"], unique=False)
    op.create_index("ix_portfolio_snapshots_timestamp", "portfolio_snapshots", ["timestamp"], unique=False)
    op.create_index(
        "ix_portfolio_snapshots_bot_timestamp",
        "portfolio_snapshots",
        ["bot_id", "timestamp"],
        unique=False,
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bot_id", sa.Integer(), nullable=True),
        sa.Column("task", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["bot_id"], ["bots.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_jobs_bot_id", "jobs", ["bot_id"], unique=False)
    op.create_index("ix_jobs_status", "jobs", ["status"], unique=False)
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"], unique=False)
    op.create_index("ix_jobs_celery_task_id", "jobs", ["celery_task_id"], unique=False)
    op.create_index("ix_jobs_bot_status", "jobs", ["bot_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_jobs_bot_status", table_name="jobs")
    op.drop_index("ix_jobs_celery_task_id", table_name="jobs")
    op.drop_index("ix_jobs_created_at", table_name="jobs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_bot_id", table_name="jobs")
    op.drop_table("jobs")

    op.drop_index("ix_portfolio_snapshots_bot_timestamp", table_name="portfolio_snapshots")
    op.drop_index("ix_portfolio_snapshots_timestamp", table_name="portfolio_snapshots")
    op.drop_index("ix_portfolio_snapshots_bot_id", table_name="portfolio_snapshots")
    op.drop_table("portfolio_snapshots")

    op.drop_index("ix_orders_symbol_status", table_name="orders")
    op.drop_index("ix_orders_trade_status", table_name="orders")
    op.drop_index("ix_orders_status", table_name="orders")
    op.drop_index("ix_orders_symbol", table_name="orders")
    op.drop_index("ix_orders_exchange_id", table_name="orders")
    op.drop_index("ix_orders_trade_id", table_name="orders")
    op.drop_table("orders")

    op.drop_index("ix_trades_bot_created_at", table_name="trades")
    op.drop_index("ix_trades_bot_status", table_name="trades")
    op.drop_index("ix_trades_created_at", table_name="trades")
    op.drop_index("ix_trades_symbol", table_name="trades")
    op.drop_index("ix_trades_status", table_name="trades")
    op.drop_index("ix_trades_bot_id", table_name="trades")
    op.drop_table("trades")

    op.drop_index("ix_strategies_name", table_name="strategies")
    op.drop_table("strategies")

    op.drop_index("ix_bots_created_at", table_name="bots")
    op.drop_index("ix_bots_stop_requested", table_name="bots")
    op.drop_index("ix_bots_status", table_name="bots")
    op.drop_index("ix_bots_name", table_name="bots")
    op.drop_table("bots")
