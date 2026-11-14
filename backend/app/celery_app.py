from celery import Celery

from app.config import settings

REDIS_URL = settings.REDIS_URL

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
