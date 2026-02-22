from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class Knobs(BaseModel):
    max_open_trades: int = Field(default=3)
    stake_amount: float = Field(default=100.0)
    stop_loss_pct: float = Field(default=5.0)
    take_profit_pct: float = Field(default=10.0)
    cooldown_minutes: int = Field(default=60)

class BotCreate(BaseModel):
    name: str
    symbols: List[str]
    timeframe: str
    paper_mode: bool = True
    strategy: str
    knobs: Knobs

class BotRead(BotCreate):
    id: int
    status: str
    created_at: datetime
    class Config:
        from_attributes = True

class PortfolioSnapshotRead(BaseModel):
    id: int
    bot_id: Optional[int]
    equity: float
    cash: float
    positions_value: float
    timestamp: datetime
    class Config:
        from_attributes = True

class TradeRead(BaseModel):
    id: int
    bot_id: int
    symbol: str
    side: str
    amount: float
    price: float
    status: str
    pnl: Optional[float]
    created_at: datetime
    class Config:
        from_attributes = True

class OrderRead(BaseModel):
    id: int
    trade_id: int
    exchange_id: Optional[str]
    symbol: str
    side: str
    type: str
    amount: float
    price: Optional[float]
    status: str
    created_at: datetime
    class Config:
        from_attributes = True

class JobRead(BaseModel):
    id: int
    bot_id: int
    task: str
    status: str
    progress: int
    created_at: datetime
    class Config:
        from_attributes = True
