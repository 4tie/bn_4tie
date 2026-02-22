from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Knobs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_open_trades: int = Field(default=3, ge=1, le=100)
    stake_amount: float = Field(default=100.0, gt=0)
    stop_loss_pct: float = Field(default=5.0, gt=0, lt=100)
    take_profit_pct: float = Field(default=10.0, gt=0, lt=100)
    cooldown_minutes: int = Field(default=60, ge=0, le=24 * 60)


class BotBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    symbols: list[str] = Field(min_length=1)
    timeframe: str = Field(min_length=1, max_length=20)
    paper_mode: Literal[True] = True
    strategy: str = Field(min_length=1, max_length=120)
    knobs: Knobs

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, value: list[str]) -> list[str]:
        normalized = [symbol.strip().upper() for symbol in value if symbol.strip()]
        if not normalized:
            raise ValueError("At least one symbol is required")

        invalid = [symbol for symbol in normalized if "/" not in symbol]
        if invalid:
            raise ValueError(f"Invalid symbols: {', '.join(invalid)}")

        return normalized


class BotCreate(BotBase):
    pass


class BotRead(BotBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    stop_requested: bool
    created_at: datetime
    updated_at: datetime


class BotStartResponse(BaseModel):
    bot_id: int
    job_id: int
    task_id: str | None
    status: str


class BotStopResponse(BaseModel):
    bot_id: int
    stop_requested: bool
    status: str


class BotKnobsUpdate(BaseModel):
    knobs: Knobs


class PortfolioSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int | None
    equity: float
    cash: float
    positions_value: float
    timestamp: datetime


class TradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    symbol: str
    side: str
    amount: float
    price: float
    status: str
    pnl: float | None
    created_at: datetime


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trade_id: int
    exchange_id: str | None
    symbol: str
    side: str
    type: str
    amount: float
    price: float | None
    status: str
    created_at: datetime


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int | None
    task: str
    status: str
    progress: int
    message: str | None
    celery_task_id: str | None
    created_at: datetime
    updated_at: datetime


class MarketTicker(BaseModel):
    symbol: str
    price: float
    change_24h: float | None = None
    timestamp: int | None = None


class MarketOhlcvResponse(BaseModel):
    symbol: str
    timeframe: str
    limit: int
    ohlcv: list[list[float | int]]


class OllamaModel(BaseModel):
    name: str
    model: str | None = None
    modified_at: str | None = None
    size: int | None = None
    digest: str | None = None
    details: dict[str, Any] | None = None
