"""Operator-only MFA recovery. Requires database access and an audit reason."""
import argparse
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine
from app.models.user import User
from app.models.operations import AuditEvent
from app.services.sessions import revoke_all


async def run(args):
    if len(args.reason.strip()) < 10:
        raise ValueError("Provide an audit reason of at least ten characters")
    try:
        async with AsyncSessionLocal() as db, db.begin():
            user = (await db.execute(select(User).where(User.email == args.email.strip().lower()).with_for_update())).scalar_one()
            if user.role.value == "client":
                raise ValueError("Staff accounts only")
            user.mfa_enabled, user.mfa_secret, user.mfa_recovery_hashes = False, None, []
            user.mfa_last_counter, user.mfa_failed_attempts, user.mfa_locked_until = -1, 0, None
            await revoke_all(db, user.id)
            # Reason must be an incident/ticket reference, never personal records.
            db.add(AuditEvent(actor_id="operator:" + args.operator, target_id=user.id, action="mfa_reset:" + args.reason[:200], outcome="reenrollment_required"))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--operator", required=True)
    parser.add_argument("--reason", required=True)
    asyncio.run(run(parser.parse_args()))
