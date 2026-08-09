import os
from celery import Celery

# Default to a local Redis instance for development if not provided
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "alaga_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.reminders"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    beat_schedule={
        "expire-stale-bookings-every-5-minutes": {
            "task": "app.tasks.reminders.expire_stale_bookings_task",
            "schedule": 300.0,  # 5 minutes in seconds
        }
    }
)
