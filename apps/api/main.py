from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

import ccxt
import redis.asyncio as redis
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db
from apps.worker.celery_app import celery_app
from packages.core.models import Bot, Job, Order, PortfolioSnapshot, Strategy, Trade
from packages.core.schemas import (
    BotCreate,
    BotKnobsUpdate,
    BotRead,
    BotStartResponse,
    BotStopResponse,
    JobRead,
    MarketOhlcvResponse,
    MarketTicker,
    OllamaModel,
    OrderRead,
    PortfolioSnapshotRead,
    TradeRead,
)
from packages.core.settings import Settings, get_settings

app = FastAPI(title="Local-First Binance Bot API", version="1.0.0")
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def _settings() -> Settings:
    return get_settings()


def _serialize_json(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _parse_symbols(symbols: str) -> list[str]:
    parsed = [symbol.strip().upper() for symbol in symbols.split(",") if symbol.strip()]
    if not parsed:
        raise HTTPException(status_code=422, detail="At least one symbol is required")

    invalid = [symbol for symbol in parsed if "/" not in symbol]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid symbol values: {', '.join(invalid)}")

    return parsed


def _fetch_binance_tickers(symbols: list[str]) -> list[dict[str, Any]]:
    exchange = ccxt.binance({"enableRateLimit": True})
    try:
        exchange.load_markets()
        tickers: dict[str, Any]
        try:
            tickers = exchange.fetch_tickers(symbols)
        except Exception:
            tickers = {symbol: exchange.fetch_ticker(symbol) for symbol in symbols}

        payload: list[dict[str, Any]] = []
        for symbol in symbols:
            ticker = tickers.get(symbol)
            if not ticker:
                continue

            last_price = ticker.get("last") or ticker.get("close")
            if last_price is None:
                continue

            payload.append(
                {
                    "symbol": symbol,
                    "price": float(last_price),
                    "change_24h": (
                        float(ticker["percentage"]) if ticker.get("percentage") is not None else None
                    ),
                    "timestamp": ticker.get("timestamp"),
                }
            )

        if not payload:
            raise RuntimeError("No ticker data returned from Binance")

        return payload
    finally:
        close_method = getattr(exchange, "close", None)
        if callable(close_method):
            close_method()


def _fetch_binance_ohlcv(symbol: str, timeframe: str, limit: int) -> list[list[float | int]]:
    exchange = ccxt.binance({"enableRateLimit": True})
    try:
        exchange.load_markets()
        rows = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        if not rows:
            raise RuntimeError("No OHLCV data returned from Binance")
        return rows
    finally:
        close_method = getattr(exchange, "close", None)
        if callable(close_method):
            close_method()


def _ollama_get(path: str) -> tuple[int, dict[str, Any]]:
    base = _settings().ollama_base_url.rstrip("/")
    req = urlrequest.Request(f"{base}{path}", headers={"Accept": "application/json"})
    with urlrequest.urlopen(req, timeout=5) as response:
        body = response.read().decode("utf-8")
        parsed: dict[str, Any] = json.loads(body) if body else {}
        return response.status, parsed


async def _redis_sse_stream(
    request: Request,
    bot_id: int | None,
    job_id: int | None,
) -> AsyncGenerator[dict[str, str], None]:
    client = redis.from_url(_settings().redis_url, decode_responses=True)
    pubsub = client.pubsub()

    await pubsub.subscribe("events")
    yield {
        "event": "system.notice",
        "data": _serialize_json(
            {
                "message": "SSE connected",
                "channel": "events",
                "ts": datetime.utcnow().isoformat() + "Z",
            }
        ),
    }

    try:
        while True:
            if await request.is_disconnected():
                break

            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message:
                await asyncio.sleep(0.1)
                continue

            raw_data = message.get("data")
            if raw_data is None:
                continue

            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            event_name = str(payload.get("event", "system.notice"))
            event_data = payload.get("data", {})
            if not isinstance(event_data, dict):
                event_data = {"value": event_data}

            if bot_id is not None and event_data.get("bot_id") != bot_id:
                continue
            if job_id is not None and event_data.get("job_id") != job_id:
                continue

            yield {"event": event_name, "data": _serialize_json(event_data)}
    finally:
        await pubsub.unsubscribe("events")
        await pubsub.close()
        await client.aclose()


@app.on_event("startup")
async def startup() -> None:
    Path(_settings().artifacts_dir).mkdir(parents=True, exist_ok=True)


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    checks: dict[str, dict[str, Any]] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = {"ok": True}
    except Exception as exc:  # pragma: no cover - runtime dependent
        checks["db"] = {"ok": False, "error": str(exc)}

    try:
        redis_client = redis.from_url(_settings().redis_url)
        await redis_client.ping()
        await redis_client.aclose()
        checks["redis"] = {"ok": True}
    except Exception as exc:  # pragma: no cover - runtime dependent
        checks["redis"] = {"ok": False, "error": str(exc)}

    artifacts_path = Path(_settings().artifacts_dir)
    checks["artifacts"] = {
        "ok": artifacts_path.exists() and artifacts_path.is_dir(),
        "path": str(artifacts_path),
    }

    overall_ok = all(item.get("ok") for item in checks.values())
    return {
        "status": "ok" if overall_ok else "degraded",
        "checks": checks,
    }


@router.get("/sse")
async def sse(
    request: Request,
    bot_id: int | None = Query(default=None),
    job_id: int | None = Query(default=None),
) -> EventSourceResponse:
    return EventSourceResponse(_redis_sse_stream(request=request, bot_id=bot_id, job_id=job_id), ping=15)


@router.get("/market/tickers", response_model=list[MarketTicker])
async def market_tickers(symbols: str = Query(..., description="Comma-separated symbols")) -> list[MarketTicker]:
    parsed_symbols = _parse_symbols(symbols)
    try:
        data = await asyncio.to_thread(_fetch_binance_tickers, parsed_symbols)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Binance tickers: {exc}") from exc

    return [MarketTicker.model_validate(item) for item in data]


@router.get("/market/ohlcv", response_model=MarketOhlcvResponse)
async def market_ohlcv(
    symbol: str = Query(..., description="Trading pair such as BTC/USDT"),
    timeframe: str = Query(default="1h"),
    limit: int = Query(default=500, ge=1, le=1000),
) -> MarketOhlcvResponse:
    normalized_symbol = symbol.strip().upper()
    if "/" not in normalized_symbol:
        raise HTTPException(status_code=422, detail="symbol must look like BASE/QUOTE, e.g. BTC/USDT")

    try:
        rows = await asyncio.to_thread(_fetch_binance_ohlcv, normalized_symbol, timeframe, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Binance OHLCV: {exc}") from exc

    return MarketOhlcvResponse(symbol=normalized_symbol, timeframe=timeframe, limit=limit, ohlcv=rows)


@router.get("/ai/models", response_model=list[OllamaModel])
async def ai_models() -> list[OllamaModel]:
    try:
        status_code, payload = await asyncio.to_thread(_ollama_get, "/api/tags")
    except (urlerror.URLError, TimeoutError, ConnectionError) as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    if status_code >= 400:
        raise HTTPException(status_code=503, detail=f"Ollama returned HTTP {status_code}")

    raw_models = payload.get("models", [])
    if not isinstance(raw_models, list):
        raise HTTPException(status_code=502, detail="Unexpected Ollama response format")

    return [OllamaModel.model_validate(item) for item in raw_models]


@router.get("/ai/health")
async def ai_health() -> dict[str, Any]:
    try:
        status_code, payload = await asyncio.to_thread(_ollama_get, "/api/tags")
        return {
            "status": "ok" if status_code < 400 else "error",
            "http_status": status_code,
            "models_count": len(payload.get("models", [])) if isinstance(payload.get("models"), list) else None,
            "base_url": _settings().ollama_base_url,
        }
    except Exception as exc:  # pragma: no cover - runtime dependent
        return {
            "status": "error",
            "base_url": _settings().ollama_base_url,
            "error": str(exc),
        }


async def _resolve_strategy_for_bot_create(db: AsyncSession, requested_strategy: str | None) -> Strategy:
    if requested_strategy:
        normalized_name = requested_strategy.strip()
        strategy_query = (
            select(Strategy)
            .where(Strategy.name == normalized_name)
            .order_by(desc(Strategy.version))
            .limit(1)
        )
        existing = (await db.execute(strategy_query)).scalars().first()
        if existing:
            return existing

        strategy = Strategy(name=normalized_name, version=1, description=None)
        db.add(strategy)
        await db.flush()
        return strategy

    baseline_query = select(Strategy).where(Strategy.name == "baseline", Strategy.version == 1).limit(1)
    baseline = (await db.execute(baseline_query)).scalars().first()
    if baseline:
        return baseline

    baseline = Strategy(name="baseline", version=1, description="Phase 1 default strategy")
    db.add(baseline)
    await db.flush()
    return baseline


@router.post("/bots", response_model=BotRead, status_code=201)
async def create_bot(payload: BotCreate, db: AsyncSession = Depends(get_db)) -> BotRead:
    resolved_strategy = await _resolve_strategy_for_bot_create(db, payload.strategy)

    bot = Bot(
        name=payload.name,
        symbols=payload.symbols,
        timeframe=payload.timeframe,
        paper_mode=payload.paper_mode,
        strategy=resolved_strategy.name,
        knobs=payload.knobs.model_dump(),
        status="stopped",
        stop_requested=False,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    bot_response = BotRead.model_validate(bot)
    return bot_response.model_copy(update={"strategy_id": resolved_strategy.id})


@router.get("/bots", response_model=list[BotRead])
async def list_bots(db: AsyncSession = Depends(get_db)) -> list[BotRead]:
    result = await db.execute(select(Bot).order_by(desc(Bot.created_at)))
    return [BotRead.model_validate(bot) for bot in result.scalars().all()]


@router.get("/bots/{bot_id}", response_model=BotRead)
async def get_bot(bot_id: int, db: AsyncSession = Depends(get_db)) -> BotRead:
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return BotRead.model_validate(bot)


@router.post("/bots/{bot_id}/start", response_model=BotStartResponse)
async def start_bot(bot_id: int, db: AsyncSession = Depends(get_db)) -> BotStartResponse:
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    bot.status = "running"
    bot.stop_requested = False

    job = Job(bot_id=bot_id, task="bot_run_loop", status="queued", progress=0, message="Queued")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    try:
        async_result = celery_app.send_task("bot_run_loop", args=[bot_id])
    except Exception as exc:
        job.status = "failed"
        job.message = f"Failed to enqueue task: {exc}"
        bot.status = "stopped"
        bot.stop_requested = True
        await db.commit()
        raise HTTPException(status_code=503, detail=f"Failed to enqueue worker task: {exc}") from exc

    job.celery_task_id = async_result.id
    await db.commit()

    return BotStartResponse(bot_id=bot_id, job_id=job.id, task_id=async_result.id, status="queued")


@router.post("/bots/{bot_id}/stop", response_model=BotStopResponse)
async def stop_bot(bot_id: int, db: AsyncSession = Depends(get_db)) -> BotStopResponse:
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    bot.status = "stopped"
    bot.stop_requested = True

    stop_job = Job(bot_id=bot_id, task="bot_stop", status="queued", progress=0, message="Stop requested")
    db.add(stop_job)
    await db.commit()

    try:
        celery_app.send_task("bot_stop", args=[bot_id])
    except Exception as exc:
        stop_job.status = "failed"
        stop_job.message = f"Failed to enqueue stop task: {exc}"
        await db.commit()
        raise HTTPException(status_code=503, detail=f"Failed to enqueue stop task: {exc}") from exc

    return BotStopResponse(bot_id=bot_id, stop_requested=True, status="stopped")


@router.post("/bots/{bot_id}/knobs", response_model=BotRead)
async def update_bot_knobs(bot_id: int, payload: BotKnobsUpdate, db: AsyncSession = Depends(get_db)) -> BotRead:
    bot = await db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    bot.knobs = payload.knobs.model_dump()
    await db.commit()
    await db.refresh(bot)
    return BotRead.model_validate(bot)


@router.get("/portfolio", response_model=PortfolioSnapshotRead)
async def get_latest_portfolio(db: AsyncSession = Depends(get_db)) -> PortfolioSnapshotRead:
    result = await db.execute(select(PortfolioSnapshot).order_by(desc(PortfolioSnapshot.timestamp)).limit(1))
    snapshot = result.scalars().first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No portfolio snapshots found")

    return PortfolioSnapshotRead.model_validate(snapshot)


@router.get("/portfolio/{bot_id}", response_model=PortfolioSnapshotRead)
async def get_bot_portfolio(bot_id: int, db: AsyncSession = Depends(get_db)) -> PortfolioSnapshotRead:
    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.bot_id == bot_id)
        .order_by(desc(PortfolioSnapshot.timestamp))
        .limit(1)
    )
    snapshot = result.scalars().first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No portfolio snapshots found for bot")

    return PortfolioSnapshotRead.model_validate(snapshot)


@router.get("/jobs", response_model=list[JobRead])
async def list_jobs(db: AsyncSession = Depends(get_db)) -> list[JobRead]:
    result = await db.execute(select(Job).order_by(desc(Job.created_at)))
    return [JobRead.model_validate(job) for job in result.scalars().all()]


@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)) -> JobRead:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobRead.model_validate(job)


@router.get("/trades", response_model=list[TradeRead])
async def list_trades(status: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> list[TradeRead]:
    query = select(Trade).order_by(desc(Trade.created_at))
    if status:
        query = query.where(Trade.status == status)

    result = await db.execute(query)
    return [TradeRead.model_validate(trade) for trade in result.scalars().all()]


@router.get("/orders", response_model=list[OrderRead])
async def list_orders(db: AsyncSession = Depends(get_db)) -> list[OrderRead]:
    result = await db.execute(select(Order).order_by(desc(Order.created_at)))
    return [OrderRead.model_validate(order) for order in result.scalars().all()]


app.include_router(router)
app.include_router(router, prefix="/api")
