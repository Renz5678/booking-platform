# Project Plan — Deployment Readiness Remediation

## Objective
Remediate all 13 deployment-readiness audit findings across the Alaga Therapy mental health booking platform (`backend/` FastAPI + PostgreSQL/Celery and `frontend-landing/` Next.js) covering Requirements R1 through R4, ensuring all acceptance criteria pass cleanly.

## Acceptance Criteria
- Full backend `pytest` suite passes against a live PostgreSQL instance (`0 failed, 0 skipped`), including new regression tests covering R1–R4:
  - Proxy IP rate-limit key isolation (`X-Forwarded-For` rightmost hop vs spoofed prefix vs local fallback).
  - Consecutive `expire_stale_bookings_task` runs across multiple `asyncio.run()` calls without loop errors.
  - On-time payment rejection updating `PaymentClaim.status == "rejected"`, expiring past-deadline bookings, and excluding active on-time reviews from `/payments/manual/claims/queue`.
  - Client cancellation while `payment.status == review` moving the submission out of `/payments/manual/queue` into `/payments/manual/claims/queue`.
  - Cancellation email `refund_pending` accuracy for manual GCash bookings and unpaid cancellations.
  - Counselor invite token SHA-256 hashing, email lowercasing, HTML escaping in rejection email, durable outbox queueing, and deactivated verified counselor access/session revocation without breaking unverified counselor onboarding.
- Frontend `npx tsc --noEmit` exits with 0 errors.
- Frontend `npm run lint` exits with 0 errors.
- Frontend `npm run build` succeeds cleanly across all routes.
- Any temporary PostgreSQL test clusters created during verification are stopped and cleaned up before completion.

## Milestones Roadmap
- **Phase 0: Survey & Codebase Reconnaissance**
  - Spawn 3 parallel Explorers:
    - Explorer 1: R1 (Rate Limiting & Celery Task) & R3 (Counselor Security & Outbox)
    - Explorer 2: R2 (Manual Payment, Claim, Cancellation State Transitions)
    - Explorer 3: R4 (Lock Hygiene, Admin Pagination/Date Filters, Calendar Cache, Analytics, Dead Code, Frontend Copy) & Test Environment Setup
  - Synthesize findings into `PROJECT.md` Feature Inventory & Architecture.
- **Milestone 1: R1 Proxy Rate Limiting & Celery Task**
  - Explorer -> Worker -> Reviewer (x2) -> Challenger (x2) -> Auditor -> Gate
- **Milestone 2: R2 Payment, Claim & Cancellation State Consistency**
  - Explorer -> Worker -> Reviewer (x2) -> Challenger (x2) -> Auditor -> Gate
- **Milestone 3: R3 Counselor Security & Onboarding Isolation**
  - Explorer -> Worker -> Reviewer (x2) -> Challenger (x2) -> Auditor -> Gate
- **Milestone 4: R4 DB Locks, Query Bounds, Analytics, Cleanup & Frontend Copy**
  - Explorer -> Worker -> Reviewer (x2) -> Challenger (x2) -> Auditor -> Gate
- **Final Milestone: Full Verification & Integration Testing**
  - Full backend pytest run against live PostgreSQL (0 failed, 0 skipped)
  - Frontend typecheck, lint, build (0 errors)
  - Verify PostgreSQL cleanup and zero regressions
  - Final Handoff to Sentinel
