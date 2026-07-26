import hashlib
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.services.payment_service import process_successful_payment

router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("/webhook")
async def paymongo_webhook(
    request: Request,
    paymongo_signature: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Receives webhook events from PayMongo.
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
    
    secret = settings.PAYMONGO_WEBHOOK_SECRET.encode('utf-8')
    expected_signature = hmac.new(secret, signature_payload.encode('utf-8'), hashlib.sha256).hexdigest()

    if expected_signature != sig_parts.get('te') and expected_signature != sig_parts.get('li'):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("data", {})
    event_type = event.get("attributes", {}).get("type")
    
    if event_type == "link.payment.paid":
        data_attr = event.get("attributes", {}).get("data", {}).get("attributes", {})
        remarks = data_attr.get("remarks")
        
        if not remarks:
            return {"msg": "No booking ID in remarks, ignored."}
        
        try:
            await process_successful_payment(remarks, db)
        except Exception as e:
            print(f"Error processing payment: {e}")
            raise HTTPException(status_code=500, detail="Failed to process payment")

    return {"msg": "Webhook received"}

@router.post("/simulate-success/{booking_id}")
async def simulate_success(booking_id: str, db: AsyncSession = Depends(get_db)):
    """
    Simulates a successful payment for a booking (development only).
    """
    try:
        result_msg = await process_successful_payment(booking_id, db)
        return {"msg": result_msg}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
