import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.future import select

from app.db.session import AsyncSessionLocal
from app.models.counselor_profile import CounselorProfile
from app.models.user import RoleEnum, User


from app.models.operations import AuditEvent
from app.services.sessions import revoke_all
from sqlalchemy import func


async def promote(email: str, role: str):
    normalized_email = email.strip().lower()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(func.lower(User.email) == normalized_email))
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
        else:
            print(f"Invalid role: {role}")
            return
            
        await revoke_all(db, user.id)
        db.add(AuditEvent(actor_id="operator_cli", target_id=user.id, action="role_change", outcome=f"promoted_to_{role}"))
        await db.commit()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python promote.py <email> <admin|counselor>")
    else:
        asyncio.run(promote(sys.argv[1], sys.argv[2]))
