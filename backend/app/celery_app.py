import os
from celery import Celery

from app.config import settings

REDIS_URL = settings.REDIS_URL or os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "alaga_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.reminders", "app.tasks.operations"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    beat_schedule={
        "dispatch-operations-every-minute": {"task": "app.tasks.operations.dispatch", "schedule": 60.0},
        "expire-stale-bookings-every-5-minutes": {
            "task": "app.tasks.reminders.expire_stale_bookings_task",
            "schedule": 300.0,  # 5 minutes in seconds
        }
    }
)
