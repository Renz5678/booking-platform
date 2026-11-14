"""Validate by default; --apply creates inactive counselor accounts atomically."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal, engine
from app.models.user import User, RoleEnum
from app.models.counselor_profile import CounselorProfile
from app.schemas.user import UserCreate
from app.services.auth_service import get_password_hash


class CounselorSeed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    bio: str = Field(max_length=5000)
    specialization_tags: list[str] = Field(max_length=30)
    initial_password_env: str = Field(pattern=r"^ALAGA_COUNSELOR_[A-Z0-9_]+_PASSWORD$")


def load(path):
    raw = json.loads(Path(path).read_text())
    if not isinstance(raw, list) or not raw:
        raise ValueError("Expected a nonempty JSON array")
    rows = [CounselorSeed.model_validate(row) for row in raw]
    emails = [str(row.email).strip().lower() for row in rows]
    if len(set(emails)) != len(emails):
        raise ValueError("Duplicate normalized email addresses")
    if len({row.initial_password_env for row in rows}) != len(rows):
        raise ValueError("Use a separate password environment variable per counselor")
    return rows


async def main(args):
    rows = load(args.file)
    print(f"Validated {len(rows)} counselor records")
    if not args.apply:
        print("No database changes. Supply --apply after setting each password environment variable.")
        return
    # Validate every secret before opening the write transaction. Never print secrets.
    hashes = []
    for row in rows:
        password = os.environ.get(row.initial_password_env)
        if not password:
            raise ValueError("A required password environment variable is missing")
        try:
            UserCreate(full_name=row.full_name, email=row.email, password=password, captcha_token="seed")
        except Exception:
            raise ValueError("An initial password does not meet the account password policy") from None
        hashes.append(get_password_hash(password))
    try:
        async with AsyncSessionLocal() as db, db.begin():
            for row, hashed in zip(rows, hashes):
                email = str(row.email).strip().lower()
                existing = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
                if existing:
                    if existing.role != RoleEnum.counselor:
                        raise ValueError("An email belongs to another account role; import rolled back")
                    # Re-running an import never changes passwords or existing profiles.
                    continue
                user = User(email=email, full_name=row.full_name, password_hash=hashed,
                            role=RoleEnum.counselor, is_verified=True, is_active=True)
                db.add(user)
                await db.flush()
                db.add(CounselorProfile(user_id=user.id, bio=row.bio,
                       specialization_tags=row.specialization_tags, is_active=False, is_verified=False))
        print("Import committed. New profiles remain inactive and require MFA, calendar setup and admin approval.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file")
    parser.add_argument("--apply", action="store_true")
    try:
        asyncio.run(main(parser.parse_args()))
    except Exception as error:
        # Validation exceptions can contain input data; avoid displaying their payload.
        print(f"Import failed ({type(error).__name__}); no secret values displayed.", file=sys.stderr)
        sys.exit(1)
