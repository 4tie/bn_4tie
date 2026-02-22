# Phase 1 Spec (Local-First Python)

## Architecture
- API: FastAPI (`apps/api`)
- Worker: Celery (`apps/worker`)
- Broker/Event Bus: Redis (`events` pubsub channel)
- Database: PostgreSQL via `DATABASE_URL`
- Market Data: `ccxt` (Binance public endpoints)
- AI Model Provider: Ollama local API (`OLLAMA_BASE_URL`, default `http://localhost:11434`)
- Artifacts directory: `storage/artifacts` (auto-created on API startup)

## Database Schema

### `bots`
- `id` PK
- `name` text indexed
- `symbols` JSON list of trading symbols
- `timeframe` text
- `paper_mode` bool (Phase 1 requires `true`)
- `strategy` text
- `knobs` JSON object
- `status` text indexed (`stopped|running|...`)
- `stop_requested` bool indexed
- `created_at` timestamptz indexed
- `updated_at` timestamptz

### `strategies`
- `id` PK
- `name` unique indexed
- `description` text nullable
- `created_at` timestamptz

### `trades`
- `id` PK
- `bot_id` FK -> `bots.id`
- `symbol` indexed
- `side`, `amount`, `price`, `status` indexed
- `pnl` nullable
- `created_at` timestamptz indexed
- Composite indexes:
- `ix_trades_bot_status` (`bot_id`, `status`)
- `ix_trades_bot_created_at` (`bot_id`, `created_at`)

### `orders`
- `id` PK
- `trade_id` FK -> `trades.id`
- `exchange_id` indexed nullable
- `symbol` indexed
- `side`, `type`, `amount`, `price`, `status` indexed
- `created_at` timestamptz
- Composite indexes:
- `ix_orders_trade_status` (`trade_id`, `status`)
- `ix_orders_symbol_status` (`symbol`, `status`)

### `portfolio_snapshots`
- `id` PK
- `bot_id` FK -> `bots.id` nullable
- `equity`, `cash`, `positions_value`
- `timestamp` timestamptz indexed
- Composite index:
- `ix_portfolio_snapshots_bot_timestamp` (`bot_id`, `timestamp`)

### `jobs`
- `id` PK
- `bot_id` FK -> `bots.id` nullable
- `task`, `status` indexed
- `progress` int 0-100
- `message` nullable
- `celery_task_id` indexed nullable
- `created_at` timestamptz indexed
- `updated_at` timestamptz
- Composite index:
- `ix_jobs_bot_status` (`bot_id`, `status`)

## API Endpoints
All endpoints are served at both root and `/api` prefixes.

### Health + SSE
- `GET /health`
- Checks DB connectivity, Redis connectivity, and artifacts dir existence.

- `GET /sse?bot_id=<int>&job_id=<int>`
- Real SSE stream from Redis pubsub channel `events`.
- Optional filtering by `bot_id` and/or `job_id`.

### Market
- `GET /market/tickers?symbols=BTC/USDT,ETH/USDT`
- Uses `ccxt.binance()` and returns real ticker values.
- Response item:
  - `symbol`
  - `price`
  - `change_24h` (nullable)
  - `timestamp` (nullable)

- `GET /market/ohlcv?symbol=BTC/USDT&timeframe=1h&limit=500`
- Uses `ccxt.binance().fetch_ohlcv`.
- Returns OHLCV array.

### AI
- `GET /ai/models`
- Calls Ollama `/api/tags` and returns discovered models.

- `GET /ai/health`
- Pings Ollama and returns status.

### Bots
- `POST /bots`
- Create bot with:
  - `name`
  - `symbols[]`
  - `timeframe`
  - `paper_mode` (must be `true`)
  - `strategy`
  - `knobs` (validated schema)

- `GET /bots`
- `GET /bots/{id}`

- `POST /bots/{id}/start`
- Sets bot running, creates a `jobs` row, enqueues Celery `bot_run_loop(bot_id)`.

- `POST /bots/{id}/stop`
- Sets bot stopped, sets stop flag, enqueues Celery `bot_stop(bot_id)`.

- `POST /bots/{id}/knobs`
- Validates and persists knobs JSON.

### Portfolio
- `GET /portfolio`
- Latest snapshot globally.

- `GET /portfolio/{bot_id}`
- Latest snapshot for a bot.

### Jobs
- `GET /jobs`
- `GET /jobs/{id}`

### Additional reads used by web
- `GET /trades`
- `GET /orders`

## Worker Behavior

### `bot_run_loop(bot_id)`
- Runs every `BOT_LOOP_INTERVAL_SECONDS`.
- Stops when bot is not `running` or stop flag is set.
- Per iteration:
  - Fetches live ticker data for bot symbols using `ccxt` (Binance public)
  - Persists one `portfolio_snapshots` row
  - Publishes `portfolio.snapshot` event to Redis `events`
  - Publishes periodic `job.progress`
- Publishes `bot.state` when entering running and stopping.

### `bot_stop(bot_id)`
- Sets stop flag and bot status.
- Publishes `bot.state` and terminal `job.progress`.

## SSE Event Payloads
All events are published to Redis channel `events` and forwarded by `/sse`.

### `bot.state`
```json
{
  "bot_id": 1,
  "status": "running",
  "job_id": 12,
  "ts": "2026-02-23T00:00:00+00:00"
}
```

### `portfolio.snapshot`
```json
{
  "bot_id": 1,
  "equity": 10000.0,
  "cash": 10000.0,
  "positions_value": 0.0,
  "ts": "2026-02-23T00:00:05+00:00",
  "prices": {
    "BTC/USDT": 97000.0,
    "ETH/USDT": 5300.0
  }
}
```

### `job.progress`
```json
{
  "bot_id": 1,
  "job_id": 12,
  "status": "running",
  "progress": 27,
  "ts": "2026-02-23T00:00:10+00:00"
}
```

### `system.notice`
```json
{
  "bot_id": 1,
  "job_id": 12,
  "message": "Ticker fetch error: ...",
  "ts": "2026-02-23T00:00:15+00:00"
}
```
