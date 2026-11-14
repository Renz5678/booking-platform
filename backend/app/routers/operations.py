from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from app.core.security import require_role
from app.db.session import get_db
from app.models.operations import OutboxJob, AuditEvent
from app.models.contact_message import ContactMessage
router = APIRouter(prefix="/admin/operations", tags=["operations"])


@router.get("/deliveries")
async def deliveries(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    rows = (await db.execute(select(OutboxJob).where(OutboxJob.status != "done").order_by(OutboxJob.created_at).offset((page-1)*50).limit(51))).scalars().all()
    return {"items": [{"id": j.id, "kind": j.kind, "status": j.status, "attempts": j.attempts, "error_code": j.error_code, "created_at": j.created_at} for j in rows[:50]], "has_more": len(rows)>50}


@router.post("/deliveries/{job_id}/retry")
async def retry(job_id: str, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    job = (await db.execute(select(OutboxJob).where(OutboxJob.id == job_id).with_for_update())).scalar_one_or_none()
    if not job or job.status != "failed":
        raise HTTPException(409, "Only exhausted jobs can be retried")
    job.status, job.attempts, job.lease_until = "pending", 0, None
    job.next_attempt_at = datetime.now(timezone.utc)
    db.add(AuditEvent(actor_id=user.id, target_id=job_id, action="delivery_retry", outcome="queued"))
    await db.commit()
    return {"msg": "Retry queued"}


@router.get("/contacts")
async def contacts(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    rows = (await db.execute(select(ContactMessage).order_by(ContactMessage.created_at.desc()).offset((page-1)*50).limit(51))).scalars().all()
    return {"items": [{"id": m.id, "name": m.name, "email": m.email, "message": m.message, "resolved": m.is_read, "created_at": m.created_at} for m in rows[:50]], "has_more": len(rows)>50}


class ContactState(BaseModel):
    resolved: bool


@router.put("/contacts/{message_id}")
async def resolve(message_id: str, data: ContactState, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    message = await db.get(ContactMessage, message_id)
    if not message:
        raise HTTPException(404, "Message not found")
    message.is_read = data.resolved
    db.add(AuditEvent(actor_id=user.id, target_id=message_id, action="contact_status", outcome="resolved" if data.resolved else "open"))
    await db.commit()
    return {"msg": "Updated"}


@router.get("/health")
async def operational_health(user=Depends(require_role(["admin"])), db=Depends(get_db)):
    from sqlalchemy import func
    from app.models.payment import Payment, PaymentStatus
    from app.config import settings
    import redis.asyncio as redis
    counts = (await db.execute(select(OutboxJob.status, func.count()).group_by(OutboxJob.status))).all()
    oldest = (await db.execute(select(func.min(OutboxJob.created_at)).where(OutboxJob.status.in_(["pending", "processing"])))).scalar()
    from app.models.operations import PaymentClaim, VerifiedTransfer
    open_claims = (await db.execute(select(func.count(PaymentClaim.id)).where(PaymentClaim.status == "open"))).scalar() or 0
    refund_obligations = (await db.execute(select(func.count(VerifiedTransfer.id)).where(VerifiedTransfer.status == "refund_pending"))).scalar() or 0
    now_dt = datetime.now(timezone.utc)
    overdue = (await db.execute(select(func.count(Payment.id)).where(Payment.status == PaymentStatus.review, Payment.review_deadline < now_dt))).scalar() or 0
    cache = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
    try:
        worker_healthy = bool(await cache.get("alaga:worker:heartbeat"))
    except Exception:
        worker_healthy = False
    finally:
        await cache.aclose()
    return {
        "jobs": dict(counts),
        "oldest_pending_at": oldest.isoformat() if oldest else None,
        "overdue_reviews": overdue,
        "open_claims": open_claims,
        "refund_obligations": refund_obligations,
        "worker_healthy": worker_healthy,
    }
