import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.rate_limit import limiter
from app.models.contact_message import ContactMessage
from app.routers.auth import verify_captcha
from app.schemas.contact import ContactMessageCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def submit_contact_form(
    request: Request,
    data: ContactMessageCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint to submit a contact form message.
    Stores the message in the database for admins to review.
    """
    if data.honeypot:
        raise HTTPException(status_code=400, detail="Bot detected")

    if not await verify_captcha(data.captcha_token):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA token")

    new_message = ContactMessage(
        name=data.name,
        email=data.email,
        message=data.message,
    )
    db.add(new_message)
    await db.commit()

    logger.info("Received contact form submission from %s", data.email)

    # In a full implementation, this could also send an email notification to admins

    return {"msg": "Your message has been received. We will get back to you shortly."}
