import asyncio
import logging

from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.booking import Booking, BookingStatus

logger = logging.getLogger(__name__)


async def check_counselor_availability(
    db: AsyncSession, counselor_id: str, start_time, end_time
) -> bool:
    """
    Checks whether a counselor has any overlapping bookings during the requested time slot.

    We check for three possible overlap scenarios using interval overlap logic:
      1. An existing booking starts before and ends after our start (surrounds the start).
      2. An existing booking starts before and ends after our end (surrounds the end).
      3. An existing booking is completely inside the requested slot.

    Only 'pending_payment' and 'confirmed' bookings are considered active —
    cancelled and completed bookings free up the slot.

    TODO: In the future, this should also:
      - Validate against the counselor's `Availability` schedule.
      - Cross-check against their Google Calendar for external conflicts.

    Returns:
        True if the slot is free, False if it is already taken.
    """
    overlapping_bookings = await db.execute(
        select(Booking).where(
            Booking.counselor_id == counselor_id,
            # Only block on active bookings
            Booking.status.in_(
                [BookingStatus.pending_payment, BookingStatus.confirmed]
            ),
            # Check all three overlap cases with OR logic
            or_(
                and_(
                    Booking.scheduled_start <= start_time,
                    Booking.scheduled_end > start_time,
                ),
                and_(
                    Booking.scheduled_start < end_time,
                    Booking.scheduled_end >= end_time,
                ),
                and_(
                    Booking.scheduled_start >= start_time,
                    Booking.scheduled_end <= end_time,
                ),
            ),
        )
    )
    # Return True if NO overlapping booking was found (slot is available).
    return not overlapping_bookings.scalar_one_or_none()


async def expire_booking_if_unpaid(
    booking_id: str, db: AsyncSession, delay_minutes: int = 30
) -> None:
    """
    Background task that automatically cancels a booking if payment is not
    completed within the hold window (default: 30 minutes).

    This implements the "slot hold" feature — when a client initiates a booking,
    the slot is reserved with status 'pending_payment'. If they don't pay in time,
    this task cancels it and frees the slot for other clients.

    Args:
        booking_id: The ID of the booking to check and potentially cancel.
        db: The async database session to use for the query.
        delay_minutes: How long to wait before checking (default: 30 minutes).

    IMPORTANT — Production Note:
        Sleeping in-memory works for MVP but is not resilient to server restarts.
        In production, replace this with a task queue (Celery + Redis) or a
        scheduled database sweeper (cron job) that checks for stale bookings on startup.
    """
    logger.info(
        "Slot hold started for booking %s. Will expire in %d minutes.",
        booking_id,
        delay_minutes,
    )

    # Sleep without blocking the async event loop using asyncio.sleep.
    await asyncio.sleep(delay_minutes * 60)

    # After the hold window, re-fetch the booking from the DB to check its current status.
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one_or_none()

    if booking and booking.status == BookingStatus.pending_payment:
        # Payment was not completed — cancel the booking to free up the slot.
        booking.status = BookingStatus.cancelled
        await db.commit()
        logger.info(
            "Booking %s automatically cancelled due to payment timeout.", booking_id
        )
    else:
        logger.info(
            "Booking %s slot hold expired but booking was already resolved (status: %s).",
            booking_id,
            booking.status if booking else "not found",
        )
