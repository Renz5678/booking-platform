from app.config import settings
if settings.ENVIRONMENT not in {"development", "test"}:
    raise RuntimeError("Demo seeds are forbidden outside local development")
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine, AsyncSessionLocal
from app.models.user import User, RoleEnum
from app.models.counselor_profile import CounselorProfile
from sqlalchemy.future import select

async def seed():
    from app.db.base import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if exists
        result = await db.execute(select(User).where(User.email == "counselor@example.com"))
        user = result.scalars().first()
        if not user:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            hashed = pwd_context.hash("Password123!")
            user = User(email="counselor@example.com", full_name="Dr. Jane Doe", password_hash=hashed, role=RoleEnum.counselor, is_verified=True)
            db.add(user)
            await db.flush()
            
            profile = CounselorProfile(user_id=user.id, is_active=True, is_verified=True, bio="Licensed psychologist specializing in anxiety, stress management, and CBT.", specialization_tags=["Anxiety", "Stress", "Depression", "CBT"])
            db.add(profile)
            await db.commit()
            await db.refresh(profile)
            print(f"Counselor Seeded! Counselor Profile ID for booking: {profile.id}")
        else:
            result = await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))
            profile = result.scalars().first()
            print(f"Counselor already exists! Counselor Profile ID for booking: {profile.id}")

        # Seed recurring availability Mon-Fri 09:00 - 17:00 if not present
        from datetime import time
        from app.models.availability import Availability
        avail_res = await db.execute(select(Availability).where(Availability.counselor_id == profile.id))
        if not avail_res.scalars().first():
            for day in range(5):  # Mon-Fri
                avail = Availability(
                    counselor_id=profile.id,
                    day_of_week=day,
                    start_time=time(9, 0),
                    end_time=time(17, 0),
                    is_recurring=True,
                )
                db.add(avail)
            await db.commit()
            print("Recurring Monday-Friday availability (09:00 - 17:00) seeded for Dr. Jane Doe!")
            
        # Admin Seed
        result_admin = await db.execute(select(User).where(User.email == "admin@example.com"))
        admin = result_admin.scalars().first()
        if not admin:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            hashed_admin = pwd_context.hash("Password123!")
            admin = User(email="admin@example.com", full_name="System Admin", password_hash=hashed_admin, role=RoleEnum.admin, is_verified=True)
            db.add(admin)
            await db.commit()
            print("Admin Seeded! (email: admin@example.com, password: Password123!)")

        # Client Seed
        result_client = await db.execute(select(User).where(User.email == "client@example.com"))
        client = result_client.scalars().first()
        if not client:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            client = User(email="client@example.com", full_name="Test Client", password_hash=pwd_context.hash("Password123!"), role=RoleEnum.client, is_verified=True)
            db.add(client)
            await db.commit()
            print("Client Seeded! (email: client@example.com, password: Password123!)")
        else:
            print("Client already exists! (email: client@example.com, password: Password123!)")

        # Specific Client Seed: lawrenzgarcia1202@gmail.com
        res_lg = await db.execute(select(User).where(User.email == "lawrenzgarcia1202@gmail.com"))
        user_lg = res_lg.scalars().first()
        if not user_lg:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            user_lg = User(email="lawrenzgarcia1202@gmail.com", full_name="Lawrenz Garcia", password_hash=pwd_context.hash("Password123!"), role=RoleEnum.client, is_verified=True)
            db.add(user_lg)
            await db.commit()
            print("Client Seeded! (email: lawrenzgarcia1202@gmail.com, password: Password123!)")
        else:
            print("Client already exists! (email: lawrenzgarcia1202@gmail.com, password: Password123!)")

        # Specific Counselor Seed: counseling858@gmail.com
        res_c858 = await db.execute(select(User).where(User.email == "counseling858@gmail.com"))
        user_c858 = res_c858.scalars().first()
        if not user_c858:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            user_c858 = User(email="counseling858@gmail.com", full_name="Alaga Counselor", password_hash=pwd_context.hash("Password123!"), role=RoleEnum.counselor, is_verified=True)
            db.add(user_c858)
            await db.flush()

            profile_c858 = CounselorProfile(
                user_id=user_c858.id,
                is_active=True,
                is_verified=True,
                bio="Licensed Professional Counselor specializing in anxiety, stress management, depression, and cognitive behavioral therapy (CBT).",
                specialization_tags=["Anxiety", "Stress", "Depression", "CBT"]
            )
            db.add(profile_c858)
            await db.commit()
            await db.refresh(profile_c858)
            print(f"Counselor Seeded! (email: counseling858@gmail.com, password: Password123!, Profile ID: {profile_c858.id})")
        else:
            res_p858 = await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user_c858.id))
            profile_c858 = res_p858.scalars().first()
            if not profile_c858:
                profile_c858 = CounselorProfile(
                    user_id=user_c858.id,
                    is_active=True,
                    is_verified=True,
                    bio="Licensed Professional Counselor specializing in anxiety, stress management, depression, and cognitive behavioral therapy (CBT).",
                    specialization_tags=["Anxiety", "Stress", "Depression", "CBT"]
                )
                db.add(profile_c858)
                await db.commit()
                await db.refresh(profile_c858)
            print(f"Counselor already exists! (email: counseling858@gmail.com, password: Password123!, Profile ID: {profile_c858.id})")

        # Seed recurring availability Mon-Fri 09:00 - 17:00 for counseling858@gmail.com
        avail_res858 = await db.execute(select(Availability).where(Availability.counselor_id == profile_c858.id))
        if not avail_res858.scalars().first():
            from datetime import time
            for day in range(5):  # Mon-Fri
                avail = Availability(
                    counselor_id=profile_c858.id,
                    day_of_week=day,
                    start_time=time(9, 0),
                    end_time=time(17, 0),
                    is_recurring=True,
                )
                db.add(avail)
            await db.commit()
            print("Recurring Monday-Friday availability (09:00 - 17:00) seeded for counseling858@gmail.com!")
            
if __name__ == "__main__":
    asyncio.run(seed())
