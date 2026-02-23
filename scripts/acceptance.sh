#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
SSE_TMP="/tmp/phase2_sse_$$.log"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

need_cmd curl
need_cmd timeout

if [ -x ".venv/bin/python3" ]; then
  PYTHON_BIN=".venv/bin/python3"
else
  need_cmd python3
  PYTHON_BIN="python3"
fi

[ -f .env ] || fail ".env is missing at repo root"

grep -q '^DATABASE_URL=' .env || fail "DATABASE_URL is missing in .env"
grep -q '^REDIS_URL=' .env || fail "REDIS_URL is missing in .env"

echo "[INFO] validating settings auto-load from .env"
"$PYTHON_BIN" - <<'PY' || exit 1
from packages.core.settings import get_settings
s = get_settings()
print("[INFO] settings loaded", s.database_url, s.redis_url)
PY

echo "[INFO] checking /health"
HEALTH_JSON="$(curl -fsS "$API_BASE/health")" || fail "Health request failed"
"$PYTHON_BIN" - <<'PY' "$HEALTH_JSON" || exit 1
import json, sys
obj = json.loads(sys.argv[1])
checks = obj.get("checks", {})
required = ["db", "redis", "artifacts"]
missing = [k for k in required if k not in checks]
if missing:
    raise SystemExit(f"[FAIL] /health missing checks: {missing}")
for key in required:
    if not checks[key].get("ok"):
        raise SystemExit(f"[FAIL] /health check failed for {key}: {checks[key]}")
print("[OK] /health checks passed")
PY

echo "[INFO] checking /market/tickers"
TICKERS_JSON="$(curl -fsS "$API_BASE/market/tickers?symbols=BTC/USDT,ETH/USDT")" || fail "Market tickers request failed"
"$PYTHON_BIN" - <<'PY' "$TICKERS_JSON" || exit 1
import json, sys
rows = json.loads(sys.argv[1])
if not isinstance(rows, list) or not rows:
    raise SystemExit("[FAIL] /market/tickers returned empty payload")
for row in rows:
    if "symbol" not in row or "price" not in row:
        raise SystemExit(f"[FAIL] malformed ticker row: {row}")
    if not isinstance(row["price"], (int, float)):
        raise SystemExit(f"[FAIL] non-numeric price in ticker row: {row}")
print("[OK] /market/tickers returned live rows")
PY

echo "[INFO] checking /ai/models"
AI_JSON="$(curl -fsS "$API_BASE/ai/models")" || fail "AI models request failed (is Ollama running?)"
"$PYTHON_BIN" - <<'PY' "$AI_JSON" || exit 1
import json, sys
rows = json.loads(sys.argv[1])
if not isinstance(rows, list):
    raise SystemExit("[FAIL] /ai/models did not return a list")
print(f"[OK] /ai/models returned {len(rows)} model(s)")
PY

echo "[INFO] creating bot without strategy"
BOT_CREATE_PAYLOAD='{
  "name": "Acceptance Bot",
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
BOT_JSON="$(curl -fsS -X POST "$API_BASE/bots" -H 'Content-Type: application/json' -d "$BOT_CREATE_PAYLOAD")" || fail "Bot create failed"
BOT_ID="$("$PYTHON_BIN" - <<'PY' "$BOT_JSON"
import json, sys
obj = json.loads(sys.argv[1])
bot_id = obj.get("id")
strategy_id = obj.get("strategy_id")
if not bot_id:
    raise SystemExit("[FAIL] create bot response missing id")
if not strategy_id:
    raise SystemExit("[FAIL] create bot response missing strategy_id")
print(bot_id)
PY
)"
echo "[OK] created bot id=$BOT_ID"

echo "[INFO] starting SSE capture"
timeout 35s curl -sN "$API_BASE/sse?bot_id=$BOT_ID" > "$SSE_TMP" &
SSE_PID=$!
sleep 1

echo "[INFO] starting bot"
START_JSON="$(curl -fsS -X POST "$API_BASE/bots/$BOT_ID/start")" || fail "Bot start failed"
"$PYTHON_BIN" - <<'PY' "$START_JSON" || exit 1
import json, sys
obj = json.loads(sys.argv[1])
if obj.get("status") != "queued":
    raise SystemExit(f"[FAIL] unexpected bot start status: {obj}")
print("[OK] bot start queued")
PY

echo "[INFO] polling portfolio snapshot"
SNAPSHOT_OK=0
for _ in $(seq 1 20); do
  HTTP_CODE="$(curl -s -o /tmp/phase1_snapshot_$$.json -w '%{http_code}' "$API_BASE/portfolio/$BOT_ID")" || true
  if [ "$HTTP_CODE" = "200" ]; then
    "$PYTHON_BIN" - <<'PY' /tmp/phase1_snapshot_$$.json || exit 1
import json, sys
obj = json.load(open(sys.argv[1]))
required = ["bot_id", "equity", "cash", "positions_value", "timestamp"]
for key in required:
    if key not in obj:
        raise SystemExit(f"[FAIL] snapshot missing {key}: {obj}")
print("[OK] portfolio snapshot present")
PY
    SNAPSHOT_OK=1
    break
  fi
  sleep 1
done

[ "$SNAPSHOT_OK" = "1" ] || fail "No portfolio snapshot detected for bot $BOT_ID"

echo "[INFO] placing paper buy order"
ORDER_JSON="$(curl -fsS -X POST "$API_BASE/orders" -H 'Content-Type: application/json' -d "{\"bot_id\":$BOT_ID,\"symbol\":\"BTC/USDT\",\"side\":\"buy\",\"type\":\"market\",\"quote_amount\":100}")" || fail "Buy order failed"
TRADE_ID="$("$PYTHON_BIN" - <<'PY' "$ORDER_JSON"
import json, sys
obj = json.loads(sys.argv[1])
trade_id = obj.get("trade_id")
order = obj.get("order") or {}
if not trade_id:
    raise SystemExit("[FAIL] buy order response missing trade_id")
if order.get("side") != "buy":
    raise SystemExit(f"[FAIL] expected buy order payload, got: {obj}")
print(trade_id)
PY
)"
echo "[OK] buy order linked trade_id=$TRADE_ID"

echo "[INFO] verifying open trade and unrealized updates"
OPEN_OK=0
for _ in $(seq 1 20); do
  OPEN_JSON="$(curl -fsS "$API_BASE/trades?status=open&bot_id=$BOT_ID")" || true
  if "$PYTHON_BIN" - <<'PY' "$OPEN_JSON" "$TRADE_ID"
import json, sys
rows = json.loads(sys.argv[1] or "[]")
trade_id = int(sys.argv[2])
trade = next((row for row in rows if row.get("id") == trade_id), None)
if not trade:
    raise SystemExit(1)
if trade.get("unrealized_pnl_quote") is None:
    raise SystemExit(2)
print("[OK] open trade has unrealized_pnl_quote")
PY
  then
    OPEN_OK=1
    break
  fi
  sleep 1
done
[ "$OPEN_OK" = "1" ] || fail "Open trade unrealized update was not observed"

echo "[INFO] closing trade by id"
CLOSE_JSON="$(curl -fsS -X POST "$API_BASE/trades/$TRADE_ID/close")" || fail "Trade close failed"
"$PYTHON_BIN" - <<'PY' "$CLOSE_JSON" || exit 1
import json, sys
obj = json.loads(sys.argv[1])
trade = obj.get("trade") or {}
if trade.get("status") != "closed":
    raise SystemExit(f"[FAIL] trade not closed: {obj}")
print("[OK] trade close endpoint returned closed trade")
PY

echo "[INFO] verifying closed trade is listed"
CLOSED_JSON="$(curl -fsS "$API_BASE/trades?status=closed&bot_id=$BOT_ID")" || fail "Closed trade query failed"
"$PYTHON_BIN" - <<'PY' "$CLOSED_JSON" "$TRADE_ID" || exit 1
import json, sys
rows = json.loads(sys.argv[1])
trade_id = int(sys.argv[2])
trade = next((row for row in rows if row.get("id") == trade_id), None)
if not trade:
    raise SystemExit("[FAIL] closed trade not found in filtered list")
print("[OK] closed trade present in list")
PY

wait "$SSE_PID" || true

for ev in bot.state portfolio.snapshot job.progress trade.opened trade.updated trade.closed; do
  rg -n "event: $ev" "$SSE_TMP" >/dev/null || fail "SSE stream missing event: $ev"
done

echo "[OK] SSE contained bot.state, portfolio.snapshot, job.progress, trade.opened, trade.updated, trade.closed"
echo "[PASS] Acceptance checks completed"
