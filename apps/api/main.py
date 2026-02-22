from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
import os
import asyncio
import json
from sse_starlette.sse import EventSourceResponse

from packages.core.models import Bot, Trade, Order, PortfolioSnapshot, Job
from packages.core.schemas import BotCreate, BotRead, PortfolioSnapshotRead, TradeRead, OrderRead, JobRead, Knobs
from apps.api.database import get_db
import redis.asyncio as redis

app = FastAPI(title="Binance Bot Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

async def redis_listener(bot_id: Optional[str], job_id: Optional[str]):
    try:
        r = redis.from_url(REDIS_URL)
        pubsub = r.pubsub()
        await pubsub.subscribe("events")
        yield {"event": "system.notice", "data": json.dumps({"message": "Connected"})}
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                # optional filtering
                yield {
                    "event": data.get("event", "message"),
                    "data": json.dumps(data.get("data", {}))
                }
    finally:
        await pubsub.unsubscribe("events")
        await r.aclose()

@app.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(select(1))
        db_status = "ok"
    except Exception:
        db_status = "error"
    
    try:
        r = redis.from_url(REDIS_URL)
        await r.ping()
        redis_status = "ok"
        await r.aclose()
    except Exception:
        redis_status = "error"

    return {"status": "ok", "db": db_status, "redis": redis_status}

@app.get("/api/sse")
async def sse(req: Request, bot_id: Optional[str] = None, job_id: Optional[str] = None):
    return EventSourceResponse(redis_listener(bot_id, job_id))

@app.get("/api/bots", response_model=List[BotRead])
async def get_bots(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bot))
    return result.scalars().all()

@app.post("/api/bots", response_model=BotRead, status_code=201)
async def create_bot(bot: BotCreate, db: AsyncSession = Depends(get_db)):
    new_bot = Bot(**bot.model_dump())
    db.add(new_bot)
    await db.commit()
    await db.refresh(new_bot)
    return new_bot

@app.get("/api/bots/{id}", response_model=BotRead)
async def get_bot(id: int, db: AsyncSession = Depends(get_db)):
    bot = await db.get(Bot, id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.post("/api/bots/{id}/start")
async def start_bot(id: int, db: AsyncSession = Depends(get_db)):
    bot = await db.get(Bot, id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot.status = "running"
    await db.commit()
    
    from apps.worker.celery_app import celery_app
    celery_app.send_task("bot_run_loop", args=[id])
    
    return {"status": "started"}

@app.post("/api/bots/{id}/stop")
async def stop_bot(id: int, db: AsyncSession = Depends(get_db)):
    bot = await db.get(Bot, id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot.status = "stopped"
    await db.commit()
    
    from apps.worker.celery_app import celery_app
    celery_app.send_task("bot_stop", args=[id])
    
    return {"status": "stopped"}

@app.post("/api/bots/{id}/knobs", response_model=BotRead)
async def update_bot_knobs(id: int, knobs: Knobs, db: AsyncSession = Depends(get_db)):
    bot = await db.get(Bot, id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot.knobs = knobs.model_dump()
    await db.commit()
    await db.refresh(bot)
    return bot

@app.get("/api/portfolio", response_model=PortfolioSnapshotRead)
async def get_global_portfolio(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PortfolioSnapshot).where(PortfolioSnapshot.bot_id == None).order_by(PortfolioSnapshot.timestamp.desc()).limit(1))
    p = result.scalars().first()
    if not p:
        raise HTTPException(status_code=404, detail="No global portfolio found")
    return p

@app.get("/api/portfolio/{bot_id}", response_model=PortfolioSnapshotRead)
async def get_bot_portfolio(bot_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PortfolioSnapshot).where(PortfolioSnapshot.bot_id == bot_id).order_by(PortfolioSnapshot.timestamp.desc()).limit(1))
    p = result.scalars().first()
    if not p:
        raise HTTPException(status_code=404, detail="No portfolio found for bot")
    return p

@app.get("/api/trades", response_model=List[TradeRead])
async def get_trades(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(Trade)
    if status:
        q = q.where(Trade.status == status)
    result = await db.execute(q)
    return result.scalars().all()

@app.get("/api/orders", response_model=List[OrderRead])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order))
    return result.scalars().all()

@app.get("/api/jobs", response_model=List[JobRead])
async def get_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job))
    return result.scalars().all()

@app.get("/api/market/tickers")
async def get_market_tickers(symbols: Optional[str] = None):
    return []

@app.get("/api/ai/models")
async def get_ai_models():
    return [{"name": "llama3:8b"}, {"name": "mistral:7b"}]
