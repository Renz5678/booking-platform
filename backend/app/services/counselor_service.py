from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.counselor_profile import CounselorProfile
from app.schemas.counselor import CounselorProfileCreate, CounselorProfileUpdate


async def get_active_counselors(db: AsyncSession):
    """Fetch all verified and active counselors for the public listing."""
    stmt = (
        select(CounselorProfile)
        .where(CounselorProfile.is_verified == True, CounselorProfile.is_active == True)
        .options(selectinload(CounselorProfile.user))
    )

    result = await db.execute(stmt)
    return result.scalars().all()


async def get_counselor_by_id(db: AsyncSession, counselor_id: str):
    """Fetch a specific counselor profile by ID."""
    stmt = (
        select(CounselorProfile)
        .where(CounselorProfile.id == counselor_id)
        .options(selectinload(CounselorProfile.user))
    )

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_counselor_by_user_id(db: AsyncSession, user_id: str):
    """Fetch a counselor profile associated with a specific user."""
    stmt = (
        select(CounselorProfile)
        .where(CounselorProfile.user_id == user_id)
        .options(selectinload(CounselorProfile.user))
    )

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_counselor_profile(
    db: AsyncSession, user_id: str, profile_data: CounselorProfileCreate
):
    """Create a new counselor profile (usually done during onboarding/admin invite)."""
    db_profile = CounselorProfile(
        user_id=user_id,
        bio=profile_data.bio,
        specialization_tags=profile_data.specialization_tags,
        credentials_url=(
            str(profile_data.credentials_url) if profile_data.credentials_url else None
        ),
        is_verified=False,  # Must be verified by admin
        is_active=False,
    )
    db.add(db_profile)
    await db.commit()
    await db.refresh(db_profile)

    # Also load the user for the response
    stmt = (
        select(CounselorProfile)
        .where(CounselorProfile.id == db_profile.id)
        .options(selectinload(CounselorProfile.user))
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def update_counselor_profile(
    db: AsyncSession, profile: CounselorProfile, update_data: CounselorProfileUpdate
):
    """Update an existing counselor profile."""
    fields_set = update_data.model_fields_set
    if update_data.bio is not None or "bio" in fields_set:
        profile.bio = update_data.bio
    if update_data.photo_url is not None or "photo_url" in fields_set:
        profile.photo_url = str(update_data.photo_url) if update_data.photo_url else None
    if update_data.specialization_tags is not None:
        profile.specialization_tags = update_data.specialization_tags
    if update_data.credentials_url is not None:
        profile.credentials_url = str(update_data.credentials_url)
    if "gcash_number" in fields_set:
        cleaned_number = update_data.gcash_number.strip() if update_data.gcash_number else None
        profile.gcash_number = cleaned_number or None
    if "gcash_qr_url" in fields_set:
        profile.gcash_qr_url = str(update_data.gcash_qr_url) if update_data.gcash_qr_url else None

    await db.commit()
    return await get_counselor_by_user_id(db, profile.user_id)
