import base64
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.encryption import decrypt_token
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import User
from app.services.calendar_service import (
    add_event_to_calendar,
    create_google_meet_event,
)
from app.services.email_service import send_booking_confirmation

logger = logging.getLogger(__name__)

PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"


def _get_paymongo_auth_header() -> str:
    """Returns the base64-encoded Basic auth header for PayMongo API calls."""
    auth_str = f"{settings.PAYMONGO_SECRET_KEY}:"
    return base64.b64encode(auth_str.encode()).decode()


async def create_paymongo_checkout(amount: float, booking_id: str) -> str:
    """
    DISABLED: Automated PayMongo Checkout Session creation.

    The platform currently uses a manual GCash payment flow — clients send
    payment directly to the counselor's GCash, and the counselor confirms via
    the dashboard (POST /bookings/{id}/mark-paid).

    To re-enable automated PayMongo payments:
    1. Set PAYMONGO_SECRET_KEY and PAYMONGO_WEBHOOK_SECRET in .env
    2. Add `reference_number: str(booking_id)` to the checkout payload below
    3. Remove the NotImplementedError and restore the original function body
    4. Restore the checkout URL return in POST /bookings/ in routers/bookings.py
    5. Re-register the PayMongo webhook in the PayMongo dashboard pointing to
       POST /payments/webhook
    """
    raise NotImplementedError(
        "PayMongo checkout is currently disabled. "
        "The platform uses manual GCash payment confirmation. "
        "See the docstring of this function for re-enablement steps."
    )


async def refund_payment(booking_id: str, db: AsyncSession) -> bool:
    """
    Issues a refund via the PayMongo Refunds API for the payment associated
    with the given booking.

    Returns True if the refund was successfully issued, False otherwise.

    The PayMongo refund API requires the Payment Intent ID (provider_payment_id),
    which is stored on the Payment record after the webhook confirms payment.
    """
    payment_result = await db.execute(
        select(Payment).where(Payment.booking_id == booking_id)
    )
    payment = payment_result.scalar_one_or_none()

    if not payment:
        logger.error("refund_payment: No payment record found for booking %s", booking_id)
        return False

    if payment.status == PaymentStatus.refunded:
        logger.info("refund_payment: Payment for booking %s already refunded.", booking_id)
        return True

    if payment.status != PaymentStatus.paid:
        logger.warning(
            "refund_payment: Cannot refund booking %s — payment status is %s",
            booking_id,
            payment.status,
        )
        return False

    if payment.provider == "gcash_manual" or not payment.provider_payment_id:
        payment.status = PaymentStatus.refund_pending
        from app.models.operations import VerifiedTransfer
        transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.booking_id == booking_id))).scalar_one_or_none()
        if not transfer and payment.transaction_reference:
            transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == payment.transaction_reference))).scalar_one_or_none()
        if transfer:
            transfer.status = "refund_pending"
            transfer.booking_id = booking_id
        else:
            ref = payment.transaction_reference or f"MANUAL-{booking_id}"
            transfer = VerifiedTransfer(
                reference=ref,
                claim_id=booking_id,
                booking_id=booking_id,
                amount=payment.amount,
                status="refund_pending",
                verified_by="system",
            )
            db.add(transfer)
        await db.flush()
        logger.warning("Manual refund requires an actual transfer and administrator reconciliation: %s", booking_id)
        return False

    amount_cents = int(payment.amount * 100)
    b64_auth = _get_paymongo_auth_header()
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Basic {b64_auth}",
    }
    payload = {
        "data": {
            "attributes": {
                "amount": amount_cents,
                "payment_id": payment.provider_payment_id,
                "reason": "others",
                "notes": f"Refund for cancelled booking {booking_id}",
            }
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYMONGO_BASE_URL}/refunds",
            json=payload,
            headers=headers,
        )
        if response.status_code not in (200, 201):
            logger.error(
                "refund_payment: PayMongo refund failed for booking %s: %s",
                booking_id,
                response.text,
            )
            return False

    payment.status = PaymentStatus.refunded
    await db.commit()
    logger.info("refund_payment: Refund issued successfully for booking %s", booking_id)
    return True


async def process_successful_payment(
    booking_id: str,
    db: AsyncSession,
    provider_payment_id: str | None = None,
    payment_method: PaymentMethod | None = None,
) -> str:
    """
    Processes a successful payment, confirming the booking and generating a Meet link.

    Args:
        booking_id: The booking to confirm.
        db: Async DB session.
        provider_payment_id: The PayMongo Payment ID from the webhook event, used for future refunds.
        payment_method: The payment method used (gcash, maya, card), extracted from the webhook.
    """
    booking = (await db.execute(select(Booking).where(Booking.id == booking_id).with_for_update())).scalar_one_or_none()
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id).with_for_update())).scalar_one_or_none()
    if not booking or not payment:
        raise ValueError("Booking or Payment not found")
    if payment.status == PaymentStatus.paid:
        return "Already paid"
    payment.status = PaymentStatus.paid
    payment.paid_at = datetime.now(timezone.utc)
    if provider_payment_id:
        payment.provider_payment_id = provider_payment_id
    if payment_method:
        payment.payment_method = payment_method
    booking.status = BookingStatus.confirmed
    booking.provisioning_status = "pending"
    from app.services.outbox import booking_job
    await booking_job(db, booking, "calendar")
    await db.commit()
    return "Payment recorded; meeting provisioning queued"
