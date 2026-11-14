"""Transactional scheduling and retryable delivery. Jobs carry record IDs only."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, or_
from app.models.operations import OutboxJob

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def enqueue(db, key, kind, payload):
    if not (await db.execute(select(OutboxJob.id).where(OutboxJob.operation_key == key))).scalar_one_or_none():
        db.add(OutboxJob(operation_key=key, kind=kind, payload=payload))


async def booking_job(db, booking, kind):
    await enqueue(db, f"{kind}:{booking.id}:{booking.schedule_version}", kind,
                  {"booking_id": booking.id, "version": booking.schedule_version})


async def execute(db, job):
    from app.models.booking import Booking, BookingStatus
    from app.models.user import User
    from app.models.payment import Payment
    from app.models.counselor_profile import CounselorProfile
    from app.models.operations import RecoveryToken
    from app.core.encryption import decrypt_token
    from app.services import calendar_service as calendar, email_service as email
    from app.routers.recovery import digest

    if job.kind in {"reset_email", "otp_email"}:
        user = await db.get(User, job.payload.get("user_id"))
        if not user or not user.is_active:
            job.payload = {"user_id": job.payload.get("user_id")}
            return
        secret = decrypt_token(job.payload["encrypted_secret"])
        if job.kind == "otp_email":
            if user.is_verified:
                job.payload = {"user_id": user.id}
                return
            if not user.verification_otp or user.verification_otp != digest(secret):
                job.payload = {"user_id": user.id}
                logger.info("OTP superseded; skipping delivery for job %s", job.id)
                return
            if user.verification_otp_expires_at and aware(user.verification_otp_expires_at) <= utcnow():
                job.payload = {"user_id": user.id}
                logger.info("OTP expired; skipping delivery for job %s", job.id)
                return
            await email.send_verification_email(user.email, secret)
        else:
            token_row = await db.get(RecoveryToken, digest(secret))
            if not token_row or token_row.user_id != user.id or aware(token_row.expires_at) <= utcnow():
                job.payload = {"user_id": user.id}
                logger.info("Reset token superseded or expired; skipping delivery for job %s", job.id)
                return
            from app.config import settings
            from html import escape
            from urllib.parse import urlencode
            link = settings.FRONTEND_URL + "/reset-password?" + urlencode({"token": secret})
            import asyncio
            if not await asyncio.to_thread(email._send_email_sync, user.email, "Reset your Alaga password", f'<p><a href="{escape(link, quote=True)}">Reset password</a>. This link expires in 30 minutes.</p>'):
                raise RuntimeError("Email delivery failed")
        return

    if job.kind == "payment_instructions_email":
        booking = await db.get(Booking, job.payload.get("booking_id"))
        if booking and booking.status == BookingStatus.pending_payment:
            client = await db.get(User, booking.client_id)
            payment = (await db.execute(select(Payment).where(Payment.booking_id == booking.id))).scalar_one_or_none()
            if client and payment:
                await email.send_payment_pending_email(client.email, booking.id, float(payment.amount))
        return

    booking = (await db.execute(select(Booking).where(Booking.id == job.payload.get("booking_id")).with_for_update())).scalar_one_or_none()
    if not booking or booking.schedule_version != job.payload.get("version"):
        return
    client = await db.get(User, booking.client_id)
    profile = await db.get(CounselorProfile, booking.counselor_id)
    if job.kind == "calendar":
        if not profile or not profile.google_refresh_token:
            raise RuntimeError("Calendar unavailable")
        token = decrypt_token(profile.google_refresh_token)
        if booking.status == BookingStatus.cancelled:
            if booking.google_calendar_event_id:
                await calendar.delete_calendar_event(token, booking.google_calendar_event_id)
            if booking.client_calendar_event_id and client.google_refresh_token:
                await calendar.delete_calendar_event(decrypt_token(client.google_refresh_token), booking.client_calendar_event_id)
            return
        if booking.status != BookingStatus.confirmed:
            return
        if booking.google_calendar_event_id:
            await calendar.update_calendar_event(token, booking.google_calendar_event_id, booking.scheduled_start, booking.scheduled_end)
        else:
            booking.meeting_link, booking.google_calendar_event_id = await calendar.create_google_meet_event("Counseling Session", booking.scheduled_start, booking.scheduled_end, booking.id, token)
        if client.google_calendar_connected and client.google_refresh_token:
            client_token = decrypt_token(client.google_refresh_token)
            if booking.client_calendar_event_id:
                await calendar.update_calendar_event(client_token, booking.client_calendar_event_id, booking.scheduled_start, booking.scheduled_end)
            else:
                booking.client_calendar_event_id = await calendar.add_event_to_calendar("Counseling Session", booking.scheduled_start, booking.scheduled_end, booking.id, booking.meeting_link, client_token)
        booking.provisioning_status = "ready"
        await booking_job(db, booking, "confirmation_email")
    elif job.kind == "confirmation_email" and booking.status == BookingStatus.confirmed:
        owner = await db.get(User, profile.user_id) if profile else None
        await email.send_booking_confirmation(client.email, booking.id, owner.full_name if owner else "Counselor", booking.scheduled_start, booking.scheduled_end, booking.meeting_link or "")
    elif job.kind == "cancellation_email" and booking.status == BookingStatus.cancelled:
        cancelled_by = job.payload.get("cancelled_by", "client")
        refund_pending = job.payload.get("refund_pending", False)
        was_paid = job.payload.get("was_paid", False)
        if cancelled_by == "counselor":
            await email.send_counselor_cancellation_notification(client.email, booking.id)
            if profile and profile.user_id:
                owner = await db.get(User, profile.user_id)
                await email.send_admin_cancellation_alert(booking.id, owner.full_name if owner else "Counselor", client.full_name if client else "Client")
        else:
            await email.send_cancellation_email(client.email, booking.id, refund_pending=refund_pending, was_paid=was_paid)
    elif job.kind == "reminder" and booking.status == BookingStatus.confirmed:
        hours = job.payload["hours"]
        delta = (aware(booking.scheduled_start) - utcnow()).total_seconds()
        if (hours - 1) * 3600 < delta <= (hours + 0.5) * 3600:
            await email.send_session_reminder(client.email, booking.id, hours, booking.meeting_link or "")
        else:
            logger.info("Stale reminder skipped: booking=%s hours=%s delta=%s", booking.id, hours, delta)


async def dispatch(session_factory):
    from app.models.booking import Booking, BookingStatus
    async with session_factory() as db:
        bookings = (await db.execute(select(Booking).where(Booking.status == BookingStatus.confirmed, Booking.scheduled_start > utcnow(), Booking.scheduled_start <= utcnow() + timedelta(hours=24)).with_for_update(skip_locked=True))).scalars().all()
        for booking in bookings:
            if booking.provisioning_status != "ready":
                continue
            remaining = (aware(booking.scheduled_start) - utcnow()).total_seconds()
            for hours in (24, 1):
                if (hours - 1) * 3600 < remaining <= hours * 3600:
                    await enqueue(db, f"reminder:{booking.id}:{booking.schedule_version}:{hours}", "reminder", {"booking_id": booking.id, "version": booking.schedule_version, "hours": hours})
        await db.commit()

    # A committed lease allows recovery after a worker crash without losing jobs.
    for _ in range(100):
        lease_token = str(uuid.uuid4())
        async with session_factory() as db:
            job = (await db.execute(select(OutboxJob).where(
                OutboxJob.status.in_(["pending", "processing"]), OutboxJob.next_attempt_at <= utcnow(),
                or_(OutboxJob.lease_until.is_(None), OutboxJob.lease_until < utcnow())
            ).order_by(OutboxJob.next_attempt_at).with_for_update(skip_locked=True).limit(1))).scalar_one_or_none()
            if not job:
                return
            job.status, job.lease_until, job.lease_token = "processing", utcnow() + timedelta(minutes=5), lease_token
            job.attempts += 1
            job_id = job.id
            await db.commit()
        async with session_factory() as db:
            # Check fencing token: only process if we still hold the lease
            job = (await db.execute(select(OutboxJob).where(OutboxJob.id == job_id, OutboxJob.lease_token == lease_token).with_for_update())).scalar_one_or_none()
            if not job:
                logger.warning("Lease expired or overtaken by another worker for job %s", job_id)
                continue
            try:
                await execute(db, job)
                job.status, job.lease_until, job.lease_token, job.error_code = "done", None, None, None
                # Secret-bearing email payloads are erased after delivery.
                if "encrypted_secret" in job.payload:
                    job.payload = {"user_id": job.payload.get("user_id")}
                await db.commit()
            except Exception as error:
                await db.rollback()
                async with session_factory() as err_db:
                    job = (await err_db.execute(select(OutboxJob).where(OutboxJob.id == job_id, OutboxJob.lease_token == lease_token).with_for_update())).scalar_one_or_none()
                    if not job:
                        logger.warning("Lease expired during error handling for job %s", job_id)
                        continue
                    job.error_code = type(error).__name__
                    job.lease_until = None
                    job.lease_token = None
                    job.status = "failed" if job.attempts >= 8 else "pending"
                    job.next_attempt_at = utcnow() + timedelta(seconds=min(3600, 30 * 2 ** job.attempts))
                    if job.status == "failed" and "encrypted_secret" in job.payload:
                        job.payload = {"user_id": job.payload.get("user_id")}
                    if job.status == "failed" and job.kind == "calendar":
                        booking = await err_db.get(Booking, job.payload.get("booking_id"))
                        if booking and booking.schedule_version == job.payload.get("version"):
                            booking.provisioning_status = "failed"
                    await err_db.commit()
                    logger.error("delivery_failure job=%s status=%s code=%s", job_id, job.status, job.error_code)
