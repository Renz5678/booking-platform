import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import require_role
from app.db.session import get_db
from app.models.payment import PaymentMethod
from app.services.payment_service import process_successful_payment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook")
async def paymongo_webhook(
    request: Request,
    paymongo_signature: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Receives webhook events from PayMongo.

    Validates the HMAC signature before processing any event.
    Extracts the booking ID, PayMongo Payment ID, and payment method
    from the event payload.
    """
    if not paymongo_signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    sig_parts = {}
    for part in paymongo_signature.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            sig_parts[k] = v

    raw_body = await request.body()
    signature_payload = f"{sig_parts.get('t', '')}.{raw_body.decode('utf-8')}"

    secret = settings.PAYMONGO_WEBHOOK_SECRET.encode("utf-8")
    expected_signature = hmac.new(
        secret, signature_payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    if expected_signature != sig_parts.get("te") and expected_signature != sig_parts.get("li"):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("data", {})
    event_type = event.get("attributes", {}).get("type")

    if event_type == "checkout_session.payment.paid":
        # Checkout session paid event
        session_attrs = event.get("attributes", {})
        payments_list = session_attrs.get("payments", [])

        booking_id = None
        provider_payment_id = None
        payment_method = None

        # Extract booking_id from reference_number or description metadata
        reference_number = session_attrs.get("reference_number")
        if reference_number:
            booking_id = reference_number

        # Extract Payment ID and method from the first payment in the list
        if payments_list:
            first_payment = payments_list[0]
            provider_payment_id = first_payment.get("id")
            raw_method = first_payment.get("attributes", {}).get("source", {}).get("type")
            # Map PayMongo method names to our enum
            method_map = {
                "gcash": PaymentMethod.gcash,
                "paymaya": PaymentMethod.maya,
                "card": PaymentMethod.card,
            }
            payment_method = method_map.get(raw_method)

        if not booking_id:
            logger.warning("checkout_session.payment.paid: no booking_id found in event, ignoring.")
            return {"msg": "No booking ID found, ignored."}

        try:
            await process_successful_payment(
                booking_id, db, provider_payment_id=provider_payment_id, payment_method=payment_method
            )
        except Exception as e:
            logger.error("Error processing payment for booking %s: %s", booking_id, e)
            raise HTTPException(status_code=500, detail="Failed to process payment")

    elif event_type == "link.payment.paid":
        # Legacy payment link event (kept for compatibility)
        data_attr = event.get("attributes", {}).get("data", {}).get("attributes", {})
        remarks = data_attr.get("remarks")

        if not remarks:
            return {"msg": "No booking ID in remarks, ignored."}

        # Extract payment ID from the parent payment object
        provider_payment_id = event.get("id")

        try:
            await process_successful_payment(
                remarks, db, provider_payment_id=provider_payment_id
            )
        except Exception as e:
            logger.error("Error processing link payment for booking %s: %s", remarks, e)
            raise HTTPException(status_code=500, detail="Failed to process payment")

    return {"msg": "Webhook received"}


@router.post("/simulate-success/{booking_id}")
async def simulate_success(
    booking_id: str,
    current_user=Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Simulates a successful payment for a booking.
    RESTRICTED: Only available in non-production environments and to admin users.
    """
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=404,
            detail="Not found",  # Return 404 (not 403) to avoid leaking endpoint existence
        )
    try:
        result_msg = await process_successful_payment(booking_id, db)
        return {"msg": result_msg}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
