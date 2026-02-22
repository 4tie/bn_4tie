from celery import Celery
import os
import json
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

celery_app = Celery("binance_bot_worker", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

r = redis.from_url(REDIS_URL)

@celery_app.task(name="bot_run_loop")
def bot_run_loop(bot_id: int):
    event = {
        "event": "bot.state",
        "data": {"bot_id": bot_id, "status": "running"}
    }
    r.publish("events", json.dumps(event))
    return {"status": "ok"}

@celery_app.task(name="bot_stop")
def bot_stop(bot_id: int):
    event = {
        "event": "bot.state",
        "data": {"bot_id": bot_id, "status": "stopped"}
    }
    r.publish("events", json.dumps(event))
    return {"status": "ok"}
