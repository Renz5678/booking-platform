import asyncio
import sys

from sqlalchemy.future import select

from app.db.session import AsyncSessionLocal
from app.models.counselor_profile import CounselorProfile
from app.models.user import RoleEnum, User


async def promote(email: str, role: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if not user:
            print(f"User with email {email} not found!")
            return
            
        if role == 'admin':
            user.role = RoleEnum.admin
            print(f"Promoted {email} to admin!")
        elif role == 'counselor':
            user.role = RoleEnum.counselor
            # Ensure they have a counselor profile too
            profile_res = await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))
            if not profile_res.scalars().first():
                db.add(CounselorProfile(user_id=user.id, is_active=True, is_verified=True))
            print(f"Promoted {email} to counselor!")
            
        await db.commit()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python promote.py <email> <admin|counselor>")
    else:
        asyncio.run(promote(sys.argv[1], sys.argv[2]))
