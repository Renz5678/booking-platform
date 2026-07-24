from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.payment_service import simulate_payment_success

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/simulate-success/{booking_id}")
async def simulate_success(booking_id: str, db: AsyncSession = Depends(get_db)):
    """
    Simulates a successful payment for a booking (development only).
    """
    try:
        result_msg = await simulate_payment_success(booking_id, db)
        return {"msg": result_msg}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
