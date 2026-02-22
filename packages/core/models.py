from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from sqlalchemy import Integer, String, Float, Boolean, DateTime, JSON, ForeignKey, func
from datetime import datetime

Base = declarative_base()

class Bot(Base):
    __tablename__ = 'bots'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    symbols: Mapped[list[str]] = mapped_column(JSON)
    timeframe: Mapped[str] = mapped_column(String)
    paper_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    strategy: Mapped[str] = mapped_column(String)
    knobs: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default="stopped")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Strategy(Base):
    __tablename__ = 'strategies'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, nullable=True)

class Trade(Base):
    __tablename__ = 'trades'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    bot_id: Mapped[int] = mapped_column(Integer, ForeignKey('bots.id'))
    symbol: Mapped[str] = mapped_column(String)
    side: Mapped[str] = mapped_column(String)
    amount: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String)
    pnl: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    trade_id: Mapped[int] = mapped_column(Integer, ForeignKey('trades.id'))
    exchange_id: Mapped[str] = mapped_column(String, nullable=True)
    symbol: Mapped[str] = mapped_column(String)
    side: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    amount: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class PortfolioSnapshot(Base):
    __tablename__ = 'portfolio_snapshots'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    bot_id: Mapped[int] = mapped_column(Integer, ForeignKey('bots.id'), nullable=True)
    equity: Mapped[float] = mapped_column(Float)
    cash: Mapped[float] = mapped_column(Float)
    positions_value: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Job(Base):
    __tablename__ = 'jobs'
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    bot_id: Mapped[int] = mapped_column(Integer, ForeignKey('bots.id'))
    task: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
