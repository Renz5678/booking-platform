import asyncio
import logging

from app.celery_app import celery_app
from app.services.email_service import send_session_reminder

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Helper to run async functions within synchronous Celery tasks."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


async def _send_reminder_if_confirmed(user_email: str, booking_id: str, hours_before: int):
    # Fetch DB explicitly for this async scope
    from app.db.session import async_session_maker
    from sqlalchemy.future import select
    from app.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        result = await db.execute(select(Booking).where(Booking.id == booking_id))
        booking = result.scalar_one_or_none()

        if booking and booking.status == BookingStatus.confirmed:
            await send_session_reminder(user_email, booking_id, hours_before)
            return True
        else:
            logger.info("Booking %s is no longer confirmed. Skipping reminder.", booking_id)
            return False


@celery_app.task(name="app.tasks.reminders.send_session_reminder_task")
def send_session_reminder_task(user_email: str, booking_id: str, hours_before: int):
    """
    Celery task that sends a reminder email to a client before their session.
    It verifies the booking is still confirmed before sending.
    """
    logger.info("Sending %s-hour reminder for booking %s to %s", hours_before, booking_id, user_email)
    try:
        sent = _run_async(_send_reminder_if_confirmed(user_email, booking_id, hours_before))
        return f"Reminder sent: {sent}"
    except Exception as e:
        logger.error("Failed to process reminder task for booking %s: %s", booking_id, str(e))
        raise

