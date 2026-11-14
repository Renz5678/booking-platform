# Production release gate — 2026-10-31

## Status Summary

All code, hardening, database schema, operational ledger, and frontend contract requirements from `REMAINING_IMPLEMENTATION_HANDOFF.md` are complete and verified.

- **Backend Test Suite**: **51 passed, 0 skipped, 0 failed** in 7.30s against real PostgreSQL (`ALAGA_POSTGRES_TEST_URL`).
- **Alembic Migrations**: Upgraded from empty PostgreSQL database to current head `e1f2a3b4c5d6_ledger_and_lease_hardening` cleanly.
- **Counselor Importer**: Verified dry-run with `backend/scripts/import_counselors.py backend/data/counselors.example.json` creating zero active accounts.
- **Frontend Typecheck**: `npx tsc --noEmit` passed with **0 errors**.
- **Frontend Lint**: `npm run lint` passed with **0 errors**, 18 warnings.
- **Frontend Production Build**: `npm run build` passed with **0 errors** across all 34 routes.
- **Dependency Audits**: Both `pip-audit` and `npm audit` return network access policy restrictions in the sandboxed verification environment.
- **Launch Gate**: `PUBLIC_LAUNCH_ENABLED=false` remains enforced by default across configuration and middleware. Staging/production signup, booking, and checkout remain closed until final external provider and account gates are satisfied.

---

## 1. Implemented & Verified Behaviors

### 1.1 Money Handling & Authoritative Ledger
- **One Verified Ledger**: Added `booking_id`, `refunded_at`, and `refunded_by` to `VerifiedTransfer`. Both cancellation refunds (`/payments/manual/{booking_id}/refund`) and late-transfer reconciliation refunds (`/payments/manual/transfers/{transfer_id}/refund`) record in `VerifiedTransfer`.
- **Reference Uniqueness**: Enforced global uniqueness across incoming claims and outgoing refund references to prevent double-spending or recording recycled references.
- **Bounded Claims**: Limited to 5 claims per booking with `409 Conflict` responses when the ceiling is reached. Account-scoped rate limits applied (`5/hour`).
- **Dedicated Admin Queues**:
  - `GET /payments/manual/claims/queue`: Paginated open claims with booking hold eligibility flags.
  - `GET /payments/manual/refunds/queue`: Paginated pending refund obligations from cancellations and verified late transfers.
- **Reconciliation Decisions**: Admin can decide `reject`, `duplicate`, `allocate` (only if booking is still in `pending_payment` with hold unexpired and exact amount matches), or `refund` (creates a `VerifiedTransfer(status="refund_pending")`).
- **Authoritative Client State**: `GET /payments/manual/{booking_id}/claims` exposes derived state (`awaiting_submission`, `under_review`, `reconciliation`, `rejected`, `expired`, `paid`, `refund_pending`, `refunded`), authoritative amounts, review deadlines, claims history, and refund status.
- **Frontend Payment Flow**:
  - `PaymentSuccessPage` and `PaymentReferenceForm` consume `GET /payments/manual/{booking_id}/claims`.
  - Distinguishes all explicit payment and reconciliation states.
  - Never prompts for another transfer once a claim is submitted/under review/reconciled/paid.
  - Polling stops in terminal states (`paid` with meeting ready, `refunded`, `expired`, `rejected`); continues while provisioning is pending.
  - Gracefully handles missing booking ID, 403/404, and network drops without declaring payment failure.
  - Client booking detail page (`/dashboard/bookings/[id]`) displays complete claims history and refund records.

### 1.2 Outbox, Leases, and Background Worker
- **Lease Token Fencing**: `OutboxJob` tracks `lease_token`. When workers process jobs, they acquire a unique UUID token. Acknowledging, failing, or updating a job checks that the lease token matches, preventing crashed/slow workers from corrupting job state.
- **Secret Erasure & Delivery Verification**:
  - For `otp_email` and `reset_email` jobs, outbox checks whether the token is still unconsumed, unexpired, and intended for an active user prior to email dispatch.
  - On terminal failure or expiration, secret payloads (`encrypted_secret`) are permanently erased.
- **Durable Notification Jobs**: Restored `payment_instructions_email` and cancellation alerts to outbox.
- **Bounded Reminder Windows**: Stale reminders (older than 2 hours or in the past) are suppressed rather than delivered late.
- **Calendar Timeouts**: Bounded `httpx.AsyncClient` timeouts (10.0s) configured across all external Google Calendar calls.

### 1.3 Recovery, Authentication, and Session Security
- **Atomic Single-Use Resets**: Password reset tokens are single-use, 30-minute expiry, and revoke all active sessions (`revoke_all`) on password change.
- **Hashed OTPs**: Verification OTPs are sha256 hashed in database with 15-minute expiry.
- **Inline OTP Resend**: Signup verification step includes an inline "Resend verification code" button with loading/success/error states calling `/auth/resend-otp` with CAPTCHA verification (`action="recovery"`), preserving entered email.
- **Consistent Email Normalization**: Trimmed and lowercased across signup, login, password reset, OTP verification, invite acceptance, promotion, and counselor import.
- **Staff Role Promotion**: `backend/scripts/promote.py` normalizes email, revokes all existing sessions, and logs `AuditEvent`.
- **Promise-Mutex Fallback**: `src/lib/api.ts` implements promise mutex serialization for environments lacking `navigator.locks` without compromising refresh safety.

### 1.4 Private Documents, Navigation, and Operations
- **Private Credential Downloads**: Strict authorization checks; download endpoint enforces `Cache-Control: no-store`.
- **Credential Download UX**: Counselor profile and admin counselor detail pages provide popup blocker detection, direct fallback link, and retry actions without permanently retaining signed URLs in client state.
- **Accessible Interactions**: Replaced browser `window.alert`, `window.confirm`, and `window.prompt` with accessible inline dialogs describing financial impacts, disabling buttons during requests, and using `role="alert"` / `role="status"` announcements.
- **Admin Navigation**: Added discoverable links in admin sidebar for `/admin/payments`, `/admin/reconciliation`, and `/admin/operations`.
- **Operations Dashboard**: `/admin/operations` surfaces worker heartbeat health, open claims, refund obligations, overdue reviews, outbox delivery retries, and contact message resolution.
- **Privacy Policy**: Added `id="terms"` anchor with clear disclaimer that terms of service and cancellation policies are pending owner approval.

---

## 2. Verification Evidence

| Area | Command / Test | Result |
| :--- | :--- | :--- |
| **Backend Suite** | `.venv/bin/python -m pytest -q` | **51 passed, 0 skipped, 0 failed** in 7.30s |
| **Database Migrations** | `.venv/bin/alembic upgrade head` | Migrated from empty PostgreSQL to head `e1f2a3b4c5d6` |
| **PostgreSQL Constraints** | `tests/test_postgres_constraints.py` | Overlap rejected, one hold per client, adjacent slots accepted |
| **Ledger & Reconciliation** | `tests/test_ledger_and_reconciliation.py` | 5-claims limit, verified transfer tracking, separate queues, 4 decisions |
| **Counselor Importer** | `python scripts/import_counselors.py data/counselors.example.json` | Dry-run passed; zero accounts created |
| **Frontend Typecheck** | `npx tsc --noEmit` | **0 errors** |
| **Frontend Lint** | `npm run lint` | **0 errors**, 18 warnings |
| **Frontend Production Build**| `npm run build` | **0 errors**, 34 routes compiled |
| **Dependency Audits** | `npm audit` / `pip-audit` | Endpoint access blocked by sandbox network policy |

---

## 3. Remaining Release Gates (Pre-Launch Prerequisites)

Before switching `PUBLIC_LAUNCH_ENABLED=true` in production:

1. **External Account & Secret Setup**:
   - Rotate any historical credentials exposed in earlier Git commits.
   - Configure actual production credentials in secret manager (`JWT_SECRET`, `ENCRYPTION_KEY`, `RECAPTCHA_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_URL`).
2. **Custom Domain & Proxy Configuration**:
   - Bind frontend and backend under same-site custom domains with HTTPS.
   - Configure trusted proxy IP CIDR blocks from Render to ensure rate limiting observes real client IPs without allowing spoofed headers.
3. **Live External Provider Smoke Testing**:
   - Test real Gmail delivery (OAuth refresh token sender).
   - Test counselor Google Calendar OAuth authorization and Meet creation.
   - Test real Cloudinary authenticated uploads and expiring downloads.
4. **Backup & Restore Drill**:
   - Execute the restore drill outlined in `DEPLOYMENT.md` on an isolated test instance.
5. **Business & Legal Approvals**:
   - Finalize and publish owner-approved Terms of Service, Cancellation Policy, and DPO contact details at `/privacy-policy#terms`.
