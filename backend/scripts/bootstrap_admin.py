"""Create the first administrator once; never creates predictable credentials."""
import asyncio
import getpass
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select, text
from app.db.session import AsyncSessionLocal, engine
from app.models import User, RoleEnum
from app.models.operations import AuditEvent
from app.schemas.user import UserCreate
from app.services.auth_service import get_password_hash


async def main():
    email = input("Administrator email: ").strip().lower()
    name = input("Full name: ").strip()
    password = getpass.getpass("Initial password: ")
    if password != getpass.getpass("Confirm password: "):
        raise ValueError("Passwords differ")
    try:
        data = UserCreate(full_name=name, email=email, password=password)
    except Exception:
        raise ValueError("Invalid account data or password policy") from None
    try:
        async with AsyncSessionLocal() as db, db.begin():
            if db.bind.dialect.name == "postgresql":
                await db.execute(text("SELECT pg_advisory_xact_lock(75423918)"))
            if (await db.execute(select(User.id).where(User.role == RoleEnum.admin))).first():
                raise ValueError("An administrator already exists; bootstrap refused")
            user = User(full_name=data.full_name, email=str(data.email).lower(), password_hash=get_password_hash(password), role=RoleEnum.admin, is_verified=True, is_active=True)
            db.add(user); await db.flush()
            db.add(AuditEvent(actor_id="operator", target_id=user.id, action="admin_bootstrap", outcome="mfa_required"))
        print("Administrator created. Sign in and enroll in MFA.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
