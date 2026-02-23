# Run Local (No Docker)

This project is local-first and runs directly on your machine.

## Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL running locally
- Redis/Valkey running locally on `127.0.0.1:6379`
- Ollama running locally on `http://localhost:11434`
- A repo-root `.env` file (auto-loaded by API, worker, and Alembic)

## 1) Create `.env` at repo root
```dotenv
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/binance_bot
REDIS_URL=redis://127.0.0.1:6379/0
OLLAMA_BASE_URL=http://localhost:11434
ARTIFACTS_DIR=storage/artifacts
BOT_LOOP_INTERVAL_SECONDS=5
PAPER_STARTING_CASH=10000
```

No manual `export` is required when `.env` exists.

## 2) Prepare Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

## 3) Ensure PostgreSQL DB exists
```bash
createdb binance_bot || true
```

## 4) Ensure Redis/Valkey is running
```bash
redis-cli ping
# if needed, start valkey in daemon mode:
valkey-server --daemonize yes --bind 127.0.0.1 --port 6379 --dir /tmp --pidfile /tmp/valkey-6379.pid --save "" --appendonly no
redis-cli ping
```

## 5) Ensure Ollama is running
```bash
curl -s http://localhost:11434/api/tags
```

## 6) Run migrations
```bash
source .venv/bin/activate
cd apps/api
alembic upgrade head
cd ../..
```

## 7) Start API
```bash
source .venv/bin/activate
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
```

## 8) Start worker
```bash
source .venv/bin/activate
celery -A apps.worker.celery_app worker --loglevel=INFO
```

## 9) Start web (optional)
```bash
npm install
npm run dev
```

## Quick verification
```bash
curl -s http://localhost:8000/health
curl -s "http://localhost:8000/market/tickers?symbols=BTC/USDT,ETH/USDT"
curl -s http://localhost:8000/ai/models
curl -N http://localhost:8000/sse
```

## Bot create/start smoke test
Create bot without `strategy` (auto-resolves to baseline v1):
```bash
curl -s -X POST http://localhost:8000/bots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Phase1 Bot",
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "timeframe": "1h",
    "paper_mode": true,
    "knobs": {
      "max_open_trades": 3,
      "stake_amount": 100,
      "stop_loss_pct": 5,
      "take_profit_pct": 10,
      "cooldown_minutes": 60
    }
  }'
```

Start the bot:
```bash
curl -s -X POST http://localhost:8000/bots/<BOT_ID>/start
```

You should see `bot.state`, then repeated `portfolio.snapshot` and `job.progress` on `/sse`.

## Acceptance helper script
```bash
bash scripts/acceptance.sh
```
