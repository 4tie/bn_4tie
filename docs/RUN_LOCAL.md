# Run Local (No Docker)

Everything runs directly on your machine.

## Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL running locally
- Redis/Valkey running locally (`127.0.0.1:6379`)
- Ollama running locally (`http://localhost:11434`)
- Repo-root `.env` file

## 1) Create `.env` at repo root
```dotenv
DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/binance_bot
REDIS_URL=redis://127.0.0.1:6379/0
OLLAMA_BASE_URL=http://localhost:11434
ARTIFACTS_DIR=storage/artifacts
BOT_LOOP_INTERVAL_SECONDS=5
PAPER_STARTING_CASH=10000
PAPER_FEE_RATE=0.001
```

No manual `export` is required when `.env` exists.

## 2) Prepare Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

## 3) Ensure local services are up
```bash
createdb binance_bot || true
pg_isready -h localhost -p 5432

redis-cli ping
# If needed:
valkey-server --daemonize yes --bind 127.0.0.1 --port 6379 --dir /tmp --pidfile /tmp/valkey-6379.pid --save "" --appendonly no
redis-cli ping

curl -s http://localhost:11434/api/tags
```

## 4) Run migrations
```bash
cd apps/api
../../.venv/bin/alembic upgrade head
cd ../..
```

## 5) Start API
```bash
source .venv/bin/activate
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
```

## 6) Start worker
```bash
source .venv/bin/activate
celery -A apps.worker.celery_app worker --loglevel=INFO
```

## 7) Start web
```bash
npm install
npm run dev
```

## 8) Start mobile (optional)
```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 npm run start
```

## Quick API checks
```bash
curl -s http://localhost:8000/health
curl -s "http://localhost:8000/market/tickers?symbols=BTC/USDT,ETH/USDT"
curl -s http://localhost:8000/ai/models
curl -N http://localhost:8000/sse
```

## Phase 2 manual order checks
Create bot without strategy (baseline auto-resolves):
```bash
curl -s -X POST http://localhost:8000/bots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Phase2 Bot",
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

Buy order:
```bash
curl -s -X POST http://localhost:8000/orders \
  -H "Content-Type: application/json" \
  -d '{"bot_id":1,"symbol":"BTC/USDT","side":"buy","type":"market","quote_amount":100}'
```

Close trade:
```bash
curl -s -X POST http://localhost:8000/trades/<TRADE_ID>/close
```

## Acceptance script
```bash
bash scripts/acceptance.sh
```

## Backend remnant verification
```bash
grep -RIn "drizzle\\|express\\|passport" . \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=attached_assets
```
