from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import ccxt
import redis
from celery import Celery
from sqlalchemy import and_, asc, desc, select

from packages.core.database import SessionLocal
from packages.core.models import Bot, Job, PortfolioSnapshot, Trade
from packages.core.settings import Settings, get_settings


@lru_cache(maxsize=1)
def _settings() -> Settings:
    return get_settings()


celery_app = Celery("binance_bot_worker", broker=_settings().redis_url, backend=_settings().redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Allows `celery -A apps.worker.celery_app worker ...` from repo root.
app = celery_app

redis_client = redis.from_url(_settings().redis_url, decode_responses=True)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _publish_event(event_name: str, payload: dict[str, Any]) -> None:
    event = {"event": event_name, "data": payload}
    redis_client.publish("events", json.dumps(event, default=str))


def _fetch_tickers(symbols: list[str]) -> dict[str, Any]:
    exchange = ccxt.binance({"enableRateLimit": True})
    try:
        exchange.load_markets()
        try:
            return exchange.fetch_tickers(symbols)
        except Exception:
            return {symbol: exchange.fetch_ticker(symbol) for symbol in symbols}
    finally:
        close_method = getattr(exchange, "close", None)
        if callable(close_method):
            close_method()


def _find_or_create_job(session: Any, bot_id: int, task_name: str, celery_task_id: str | None) -> Job:
    job = (
        session.execute(
            select(Job)
            .where(
                and_(
                    Job.bot_id == bot_id,
                    Job.task == task_name,
                    Job.status.in_(["queued", "running"]),
                )
            )
            .order_by(desc(Job.created_at))
            .limit(1)
        )
        .scalars()
        .first()
    )

    if job:
        if celery_task_id:
            job.celery_task_id = celery_task_id
        return job

    job = Job(
        bot_id=bot_id,
        task=task_name,
        status="queued",
        progress=0,
        message="Queued",
        celery_task_id=celery_task_id,
    )
    session.add(job)
    session.flush()
    return job


def _resolve_fee_rate(bot: Bot) -> float:
    default_fee = float(_settings().paper_fee_rate)
    if not isinstance(bot.knobs, dict):
        return default_fee
    raw = bot.knobs.get("fee_rate")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default_fee
    if value < 0:
        return default_fee
    return value


@celery_app.task(name="bot_run_loop", bind=True)
def bot_run_loop(self: Any, bot_id: int) -> dict[str, Any]:
    interval_seconds = max(float(_settings().bot_loop_interval_seconds), 1.0)
    iteration = 0
    job_id: int | None = None

    try:
        with SessionLocal() as session:
            bot = session.get(Bot, bot_id)
            if not bot:
                _publish_event(
                    "system.notice",
                    {
                        "bot_id": bot_id,
                        "message": "bot_run_loop received unknown bot_id",
                        "ts": _utc_now().isoformat(),
                    },
                )
                return {"status": "bot_not_found", "bot_id": bot_id}

            bot.status = "running"
            bot.stop_requested = False

            job = _find_or_create_job(session, bot_id, "bot_run_loop", self.request.id)
            job.status = "running"
            job.progress = 0
            job.message = "Worker loop started"
            job_id = job.id

            session.commit()

        _publish_event(
            "bot.state",
            {"bot_id": bot_id, "status": "running", "job_id": job_id, "ts": _utc_now().isoformat()},
        )

        while True:
            with SessionLocal() as session:
                bot = session.get(Bot, bot_id)
                job = session.get(Job, job_id) if job_id else None

                if not bot:
                    if job:
                        job.status = "failed"
                        job.message = "Bot deleted while running"
                        session.commit()
                    _publish_event(
                        "system.notice",
                        {
                            "bot_id": bot_id,
                            "job_id": job_id,
                            "message": "Bot deleted while loop was active",
                            "ts": _utc_now().isoformat(),
                        },
                    )
                    return {"status": "bot_deleted", "bot_id": bot_id}

                if bot.status != "running" or bot.stop_requested:
                    bot.status = "stopped"
                    bot.stop_requested = False
                    if job:
                        job.status = "completed"
                        job.progress = 100
                        job.message = "Bot loop stopped"
                    session.commit()

                    _publish_event(
                        "bot.state",
                        {
                            "bot_id": bot_id,
                            "status": "stopped",
                            "job_id": job_id,
                            "ts": _utc_now().isoformat(),
                        },
                    )
                    if job_id:
                        _publish_event(
                            "job.progress",
                            {
                                "bot_id": bot_id,
                                "job_id": job_id,
                                "status": "completed",
                                "progress": 100,
                                "ts": _utc_now().isoformat(),
                            },
                        )
                    return {"status": "stopped", "bot_id": bot_id, "job_id": job_id}

                symbols = [symbol for symbol in (bot.symbols or []) if isinstance(symbol, str) and symbol.strip()]

                if not symbols:
                    if job:
                        job.message = "Bot has no symbols configured"
                        session.commit()
                    _publish_event(
                        "system.notice",
                        {
                            "bot_id": bot_id,
                            "job_id": job_id,
                            "message": "Bot has no symbols configured",
                            "ts": _utc_now().isoformat(),
                        },
                    )
                    time.sleep(interval_seconds)
                    continue

            try:
                tickers = _fetch_tickers(symbols)
            except Exception as exc:
                with SessionLocal() as session:
                    job = session.get(Job, job_id) if job_id else None
                    if job:
                        job.status = "running"
                        job.message = f"Ticker fetch error: {exc}"
                        session.commit()

                _publish_event(
                    "system.notice",
                    {
                        "bot_id": bot_id,
                        "job_id": job_id,
                        "message": f"Ticker fetch error: {exc}",
                        "ts": _utc_now().isoformat(),
                    },
                )
                time.sleep(interval_seconds)
                continue

            with SessionLocal() as session:
                bot = session.get(Bot, bot_id)
                fee_rate = _resolve_fee_rate(bot) if bot else float(_settings().paper_fee_rate)

                open_trades = (
                    session.execute(
                        select(Trade)
                        .where(Trade.bot_id == bot_id, Trade.status == "open")
                        .order_by(asc(Trade.created_at))
                    )
                    .scalars()
                    .all()
                )
                closed_trades = (
                    session.execute(
                        select(Trade)
                        .where(Trade.bot_id == bot_id, Trade.status == "closed")
                        .order_by(asc(Trade.created_at))
                    )
                    .scalars()
                    .all()
                )

                positions_value = 0.0
                open_locked_cost = 0.0
                realized_closed = 0.0

                last_prices: dict[str, float] = {}
                trade_updates: list[dict[str, Any]] = []
                for symbol in symbols:
                    ticker = tickers.get(symbol) or {}
                    last = ticker.get("last") or ticker.get("close")
                    if last is not None:
                        last_prices[symbol] = float(last)

                for trade in open_trades:
                    mark_price = last_prices.get(trade.symbol)
                    if mark_price is None:
                        continue

                    mark_value = float(trade.amount * mark_price)
                    unrealized = float(mark_value - (trade.cost_basis_quote or 0.0) - (trade.fees_paid_quote or 0.0))

                    trade.unrealized_pnl_quote = unrealized
                    trade.pnl = unrealized

                    positions_value += mark_value
                    open_locked_cost += float((trade.cost_basis_quote or 0.0) + (trade.fees_paid_quote or 0.0))

                    trade_updates.append(
                        {
                            "bot_id": bot_id,
                            "trade_id": trade.id,
                            "symbol": trade.symbol,
                            "price": mark_price,
                            "unrealized_pnl_quote": unrealized,
                            "ts": _utc_now().isoformat(),
                        }
                    )

                for trade in closed_trades:
                    realized_closed += float(trade.realized_pnl_quote or 0.0)

                cash = float(_settings().paper_starting_cash + realized_closed - open_locked_cost)
                equity = float(cash + positions_value)

                snapshot = PortfolioSnapshot(
                    bot_id=bot_id,
                    equity=equity,
                    cash=cash,
                    positions_value=positions_value,
                    timestamp=_utc_now(),
                )
                session.add(snapshot)

                iteration += 1
                progress = min(99, iteration)

                job = session.get(Job, job_id) if job_id else None
                if job:
                    job.status = "running"
                    job.progress = progress
                    job.message = f"Loop iteration {iteration}"

                session.commit()
                session.refresh(snapshot)

            for update in trade_updates:
                _publish_event("trade.updated", update)

            _publish_event(
                "portfolio.snapshot",
                {
                    "bot_id": bot_id,
                    "equity": equity,
                    "cash": cash,
                    "positions_value": positions_value,
                    "ts": snapshot.timestamp.isoformat(),
                    "prices": last_prices,
                    "fee_rate": fee_rate,
                },
            )

            if job_id and (iteration == 1 or iteration % 3 == 0):
                _publish_event(
                    "job.progress",
                    {
                        "bot_id": bot_id,
                        "job_id": job_id,
                        "status": "running",
                        "progress": min(99, iteration),
                        "ts": _utc_now().isoformat(),
                    },
                )

            time.sleep(interval_seconds)

    except Exception as exc:
        with SessionLocal() as session:
            bot = session.get(Bot, bot_id)
            if bot:
                bot.status = "stopped"
                bot.stop_requested = False

            job = session.get(Job, job_id) if job_id else None
            if job:
                job.status = "failed"
                job.message = str(exc)

            session.commit()

        _publish_event(
            "bot.state",
            {
                "bot_id": bot_id,
                "status": "stopped",
                "job_id": job_id,
                "ts": _utc_now().isoformat(),
            },
        )
        _publish_event(
            "system.notice",
            {
                "bot_id": bot_id,
                "job_id": job_id,
                "message": f"bot_run_loop failed: {exc}",
                "ts": _utc_now().isoformat(),
            },
        )
        raise


@celery_app.task(name="bot_stop", bind=True)
def bot_stop(self: Any, bot_id: int) -> dict[str, Any]:
    with SessionLocal() as session:
        bot = session.get(Bot, bot_id)
        if not bot:
            _publish_event(
                "system.notice",
                {
                    "bot_id": bot_id,
                    "message": "bot_stop received unknown bot_id",
                    "ts": _utc_now().isoformat(),
                },
            )
            return {"status": "bot_not_found", "bot_id": bot_id}

        bot.status = "stopped"
        bot.stop_requested = True

        stop_job = _find_or_create_job(session, bot_id, "bot_stop", self.request.id)
        stop_job.status = "completed"
        stop_job.progress = 100
        stop_job.message = "Stop signal set"
        stop_job.celery_task_id = self.request.id

        session.commit()

        stop_job_id = stop_job.id

    _publish_event(
        "bot.state",
        {
            "bot_id": bot_id,
            "status": "stopped",
            "job_id": stop_job_id,
            "ts": _utc_now().isoformat(),
        },
    )
    _publish_event(
        "job.progress",
        {
            "bot_id": bot_id,
            "job_id": stop_job_id,
            "status": "completed",
            "progress": 100,
            "ts": _utc_now().isoformat(),
        },
    )

    return {"status": "stop_requested", "bot_id": bot_id, "job_id": stop_job_id}
