# Run Local (No Docker)

This project is local-first and runs directly on your machine.

## Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL running locally
- Redis running locally
- Ollama running locally (for AI endpoints)

## 1) Create and activate Python venv
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

## 2) Set environment variables
```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/binance_bot"
export REDIS_URL="redis://localhost:6379/0"
export OLLAMA_BASE_URL="http://localhost:11434"
export ARTIFACTS_DIR="storage/artifacts"
export BOT_LOOP_INTERVAL_SECONDS="5"
export PAPER_STARTING_CASH="10000"
```

## 3) Run database migrations (Alembic in `apps/api`)
```bash
cd apps/api
alembic upgrade head
cd ../..
```

## 4) Start API (FastAPI)
```bash
source .venv/bin/activate
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --reload
```

## 5) Start worker (Celery)
```bash
source .venv/bin/activate
celery -A apps.worker.celery_app.celery_app worker --loglevel=info
```

## 6) Start web (Vite)
```bash
npm install
npm run dev
```

## 7) Start mobile (Expo, if present)
If `apps/mobile` contains an Expo app:
```bash
cd apps/mobile
npm install
npm run start
```

## API path notes
All endpoints are available at both root and `/api` prefixes for compatibility.
- Example health: `http://localhost:8000/health` and `http://localhost:8000/api/health`

## Verification commands
Run cleanup check:
```bash
grep -RIn "drizzle|express|passport" .
```
Expected: no hits in backend/runtime paths (`apps/api`, `apps/worker`, `packages`).

Run acceptance checks:
```bash
python -m compileall apps packages

curl -s http://localhost:8000/health
curl -s "http://localhost:8000/market/tickers?symbols=BTC/USDT,ETH/USDT"
curl -s http://localhost:8000/ai/models

# SSE stream
curl -N http://localhost:8000/sse
```

## Start a bot and watch SSE
1. Create bot:
```bash
curl -s -X POST http://localhost:8000/bots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BTC Runner",
    "symbols": ["BTC/USDT", "ETH/USDT"],
    "timeframe": "1h",
    "paper_mode": true,
    "strategy": "RSI_MACD",
    "knobs": {
      "max_open_trades": 3,
      "stake_amount": 100,
      "stop_loss_pct": 5,
      "take_profit_pct": 10,
      "cooldown_minutes": 60
    }
  }'
```
2. Start bot:
```bash
curl -s -X POST http://localhost:8000/bots/1/start
```
3. SSE should show `bot.state` followed by repeated `portfolio.snapshot` events.
