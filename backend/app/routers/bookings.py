from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.intake_form import IntakeForm
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingResponse
from app.services.booking_service import (
    check_counselor_availability,
    expire_booking_if_unpaid,
)
from app.services.payment_service import create_simulated_checkout

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking_data: BookingCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new booking, creates the intake form, initiates payment session, and starts a 30m slot hold.
    """
    # 1. Check if the client is creating this for themselves
    if current_user.role.value != "client":
        raise HTTPException(status_code=403, detail="Only clients can book sessions")

    # 2. Check counselor availability
    is_available = await check_counselor_availability(
        db,
        booking_data.counselor_id,
        booking_data.scheduled_start,
        booking_data.scheduled_end,
    )
    if not is_available:
        raise HTTPException(
            status_code=400,
            detail="The counselor is not available during this time slot.",
        )

    # 3. Create Booking (status: pending_payment)
    new_booking = Booking(
        client_id=current_user.id,
        counselor_id=booking_data.counselor_id,
        scheduled_start=booking_data.scheduled_start,
        scheduled_end=booking_data.scheduled_end,
        status=BookingStatus.pending_payment,
    )
    db.add(new_booking)
    await db.flush()  # flush to get the new_booking.id

    # 4. Create Intake Form
    intake_form = IntakeForm(
        booking_id=new_booking.id,
        concern_category=booking_data.intake_concern_category,
        notes=booking_data.intake_notes,
    )
    db.add(intake_form)

    # 5. Create Payment record
    amount = 1500.0  # Platform standard MVP rate
    payment = Payment(
        booking_id=new_booking.id,
        amount=amount,
        currency="PHP",
        status=PaymentStatus.pending,
    )
    db.add(payment)

    await db.commit()

    # 6. Call payment service
    checkout_url = await create_simulated_checkout(amount, new_booking.id)

    # 7. Start background task to expire booking in 30 minutes if unpaid
    background_tasks.add_task(expire_booking_if_unpaid, new_booking.id, db, 30)

    return {
        "msg": "Booking initiated. Please complete payment within 30 minutes.",
        "booking_id": new_booking.id,
        "checkout_url": checkout_url,
    }


@router.get("/me", response_model=list[BookingResponse])
async def get_my_bookings(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """
    Returns bookings for the currently authenticated client.
    """
    result = await db.execute(
        select(Booking).where(Booking.client_id == current_user.id)
    )
    return result.scalars().all()
