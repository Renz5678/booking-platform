import asyncio
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.future import select

from app.db.session import AsyncSessionLocal
from app.models.counselor_profile import CounselorProfile
from app.models.user import RoleEnum, User
from app.services.auth_service import get_password_hash

COUNSELORS = [
    {
        "email": "princess.gaganao@alaga.ph",
        "full_name": "Dr. Princess Lara V. Gaganao",
        "specialization_tags": [
            "Personal & Academic Growth",
            "Career Development",
            "Values & Resilience",
        ],
        "bio": (
            "Licensed Guidance Counselor, Values Education Teacher, Mental Health Advocate, "
            "and Career Development Advocate. Passionate about guiding learners in their "
            "personal, academic, and career growth while promoting positive values, resilience, "
            "and holistic development to help students become responsible, confident, and "
            "future-ready individuals."
        ),
    },
    {
        "email": "danree.degula@alaga.ph",
        "full_name": "Sir Danree De Gula, LPT, MAEd, RGC",
        "specialization_tags": [
            "Career Guidance",
            "Personal & Social Development",
            "Academic Growth",
        ],
        "bio": (
            "Dedicated teacher and Certified Career Guidance Advocate who champions the four "
            "domains of guidance: Personal, Academic, Career, and Social Development. A Teacher "
            "III at Gen. T. De Leon National High School, he leads initiatives that equip "
            "students with life skills, decision-making tools, and career pathways in a safe "
            "and supportive space where no learner is left behind."
        ),
    },
    {
        "email": "jasmin.santos@alaga.ph",
        "full_name": "Dr. Jasmin Gacutan-Santos",
        "specialization_tags": [
            "Mental Wellness",
            "Student Empowerment",
            "Academic Counseling",
        ],
        "bio": (
            "Licensed Guidance Counselor, Mental Health Advocate, and Licensed Professional "
            "Teacher committed to creating safe, supportive, and empowering learning "
            "environments. Currently serving as an Instructor and University Counselor at "
            "Pampanga State Agricultural University, striving to inspire lifelong learning, "
            "promote mental wellness, and help students reach their fullest potential."
        ),
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        for entry in COUNSELORS:
            res = await db.execute(select(User).where(User.email == entry["email"]))
            user = res.scalars().first()

            if not user:
                user = User(
                    email=entry["email"],
                    full_name=entry["full_name"],
                    password_hash=get_password_hash(secrets.token_urlsafe(32)),
                    role=RoleEnum.counselor,
                    is_verified=True,
                )
                db.add(user)
                await db.flush()
                print(f"Created user: {entry['full_name']} ({entry['email']})")
            else:
                user.role = RoleEnum.counselor
                user.full_name = entry["full_name"]
                user.is_verified = True
                print(f"Updated existing user: {entry['full_name']} ({entry['email']})")

            prof_res = await db.execute(
                select(CounselorProfile).where(CounselorProfile.user_id == user.id)
            )
            profile = prof_res.scalars().first()

            if not profile:
                profile = CounselorProfile(
                    user_id=user.id,
                    bio=entry["bio"],
                    specialization_tags=entry["specialization_tags"],
                    photo_url=None,
                    is_verified=True,
                    is_active=True,
                )
                db.add(profile)
                print(f"Created profile for: {entry['full_name']}")
            else:
                profile.bio = entry["bio"]
                profile.specialization_tags = entry["specialization_tags"]
                profile.is_verified = True
                profile.is_active = True
                print(f"Updated profile for: {entry['full_name']}")

        await db.commit()
    print("Seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
