import asyncio, os, uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.exc import IntegrityError, DBAPIError
from app.models import User, CounselorProfile, Booking, BookingStatus

import pytest

@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("ALAGA_POSTGRES_TEST_URL"), reason="Requires an isolated PostgreSQL test database")
async def test_postgresql_booking_constraints():
    engine = create_async_engine(os.environ['ALAGA_POSTGRES_TEST_URL'])
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        counselor_user = User(email=f'{uuid.uuid4()}@example.com', full_name='Counselor', password_hash='unused')
        clients = [User(email=f'{uuid.uuid4()}@example.com', full_name='Client', password_hash='unused') for _ in range(3)]
        db.add_all([counselor_user, *clients]); await db.flush()
        counselor = CounselorProfile(user_id=counselor_user.id, is_active=True, is_verified=True)
        db.add(counselor); await db.commit()
    start = datetime.now(timezone.utc) + timedelta(days=7)
    async def reserve(client_id, offset=0):
        async with sessions() as db:
            db.add(Booking(client_id=client_id, counselor_id=counselor.id, scheduled_start=start+timedelta(hours=offset), scheduled_end=start+timedelta(hours=offset+1), status=BookingStatus.pending_payment))
            try:
                await db.commit(); return 'created'
            except (IntegrityError, DBAPIError):
                await db.rollback(); return 'conflict'
    results = await asyncio.gather(reserve(clients[0].id), reserve(clients[1].id))
    assert sorted(results) == ['conflict', 'created'], results
    winner = clients[results.index('created')]
    assert await reserve(winner.id, 2) == 'conflict', 'one pending hold per client'
    assert await reserve(clients[2].id, 1) == 'created', 'adjacent slots must remain available'
    print('PASS: concurrent overlap rejected; one pending hold enforced; adjacent slot accepted')
    await engine.dispose()

