# Phase 2 Spec (Local-First Python)

## Architecture
- API: FastAPI (`apps/api`)
- Worker: Celery (`apps/worker`)
- Broker + event bus: Redis pubsub channel `events`
- Database: PostgreSQL via `DATABASE_URL`
- Market data: `ccxt` Binance public endpoints
- AI models: Ollama (`OLLAMA_BASE_URL`, default `http://localhost:11434`)
- Artifacts: `storage/artifacts` auto-created on API startup

All API endpoints are available at both root path and `/api` prefix.

## Database Schema

### `bots`
- `id`, `name`, `symbols`, `timeframe`, `paper_mode`, `strategy`, `knobs`
- `status`, `stop_requested`, `created_at`, `updated_at`

### `strategies`
- `id`, `name`, `version`, `description`, `created_at`
- Unique index: `(name, version)`

### `trades`
- `id`, `bot_id` (nullable FK), `symbol`, `side`, `amount`, `price`, `status`
- `cost_basis_quote`, `fees_paid_quote`
- `unrealized_pnl_quote`, `realized_pnl_quote`, `pnl`, `closed_at`
- `created_at`
- Indexes:
- `(bot_id, status)`
- `(bot_id, created_at)`

### `orders`
- `id`, `bot_id` (nullable FK), `trade_id` (nullable FK)
- `exchange_id`, `symbol`, `side`, `type`, `amount`
- `quote_amount`, `base_qty`, `price`, `fee_quote`, `paper_mode`, `status`
- `created_at`
- Indexes:
- `(trade_id, status)`
- `(symbol, status)`
- `bot_id`

### `portfolio_snapshots`
- `id`, `bot_id` (nullable FK), `equity`, `cash`, `positions_value`, `timestamp`
- Index: `(bot_id, timestamp)`

### `jobs`
- `id`, `bot_id` (nullable FK), `task`, `status`, `progress`, `message`, `celery_task_id`
- `created_at`, `updated_at`
- Index: `(bot_id, status)`

## Core API Endpoints

### Health + SSE
- `GET /health`
  - Checks DB connectivity, Redis connectivity, artifacts path.
- `GET /sse?bot_id=<id>&job_id=<id>`
  - Streams from Redis channel `events`.
  - Supports optional `bot_id` / `job_id` filters.

### Market
- `GET /market/tickers?symbols=BTC/USDT,ETH/USDT`
  - Real ticker data from `ccxt.binance()`.
- `GET /market/ohlcv?symbol=BTC/USDT&timeframe=1h&limit=500`
  - Real OHLCV from Binance via ccxt.

### AI
- `GET /ai/models`
  - Calls Ollama `GET /api/tags`, no hardcoded list.
- `GET /ai/health`
  - Ollama reachability check.

### Bots
- `POST /bots`
  - `strategy` is optional.
  - If omitted, API resolves/creates default `baseline` v1 strategy.
- `GET /bots`
- `GET /bots/{id}`
- `POST /bots/{id}/start`
- `POST /bots/{id}/stop`
- `POST /bots/{id}/knobs`

### Orders (Phase 2)
- `POST /orders` (paper market only)
  - Request:
    - `bot_id` optional
    - `symbol`
    - `side` = `buy|sell`
    - `type` = `market`
    - `quote_amount` or `base_qty` (buy requires exactly one)
  - Response:
    - `order`
    - `trade_id` (if created/linked)

### Trades (Phase 2)
- `GET /trades?status=open|closed&bot_id=<id>`
- `POST /trades/{id}/close`
  - Closes open paper trade at live market price.

### Portfolio + Jobs
- `GET /portfolio`
- `GET /portfolio/{bot_id}`
- `GET /jobs`
- `GET /jobs/{id}`

## Paper Execution Rules

### Buy market
- Fetch live price from Binance ticker.
- If `quote_amount` provided: `qty = quote_amount / price`.
- Fee: `fee_rate * quote_amount` where `fee_rate` comes from:
  - bot `knobs.fee_rate` if valid, else `PAPER_FEE_RATE` default.
- Create open `trade` + filled `order`.
- Emit `trade.opened`.

### Sell market / close
- Close open trade by live market price.
- Proceeds: `qty * price`.
- Fee: `fee_rate * proceeds`.
- Realized PnL: `proceeds - cost_basis_quote - total_fees`.
- Update trade to `closed`, create filled sell order.
- Emit `trade.closed`.

### Worker mark-to-market
On each bot loop tick:
- Fetch latest prices for configured symbols.
- Update `unrealized_pnl_quote` for open trades.
- Emit `trade.updated` for each updated trade.
- Persist `portfolio_snapshots`.
- Emit `portfolio.snapshot`.
- Emit periodic `job.progress` and `bot.state` transitions.

## SSE Events
All emitted on Redis channel `events` and forwarded by `/sse`.

### `bot.state`
```json
{
  "bot_id": 1,
  "status": "running",
  "job_id": 10,
  "ts": "2026-02-23T04:00:00+00:00"
}
```

### `portfolio.snapshot`
```json
{
  "bot_id": 1,
  "equity": 9999.4,
  "cash": 9899.4,
  "positions_value": 100.0,
  "ts": "2026-02-23T04:00:05+00:00"
}
```

### `job.progress`
```json
{
  "bot_id": 1,
  "job_id": 10,
  "status": "running",
  "progress": 15,
  "ts": "2026-02-23T04:00:05+00:00"
}
```

### `trade.opened`
```json
{
  "bot_id": 1,
  "trade_id": 21,
  "order_id": 35,
  "symbol": "BTC/USDT",
  "qty": 0.001,
  "price": 100000.0,
  "cost_basis_quote": 100.0,
  "fee_quote": 0.1,
  "ts": "2026-02-23T04:01:00+00:00"
}
```

### `trade.updated`
```json
{
  "bot_id": 1,
  "trade_id": 21,
  "symbol": "BTC/USDT",
  "price": 100120.0,
  "unrealized_pnl_quote": 0.02,
  "ts": "2026-02-23T04:01:05+00:00"
}
```

### `trade.closed`
```json
{
  "bot_id": 1,
  "trade_id": 21,
  "order_id": 36,
  "symbol": "BTC/USDT",
  "price": 100200.0,
  "realized_pnl_quote": 0.1,
  "fees_paid_quote": 0.2,
  "ts": "2026-02-23T04:01:10+00:00"
}
```

### `system.notice`
```json
{
  "message": "Ticker fetch error: ...",
  "ts": "2026-02-23T04:01:15+00:00"
}
```
