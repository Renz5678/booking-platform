# Frontend and backend follow-up review — 2026-10-31

Decision: keep public registration and payments closed. The implemented protections are useful, but the following code paths still prevent production sign-off. This is a source review of the current uncommitted working tree, not a penetration-test certification. No application behavior was changed during this review.

## Confirmed launch blockers

### 1. Credential documents use public delivery URLs
- Evidence: `backend/app/routers/counselors.py`, `_validate_and_upload` and `/me/credentials`, upload without private/authenticated delivery configuration and save the returned `secure_url`. Public IDs are derived from counselor IDs.
- Consequence: possession of a document URL bypasses application authorization. HTTPS does not make the object private.
- Fix: separate public photos from authenticated credential storage, store object identifiers, authorize every download, issue short-lived links, and migrate/revoke existing public objects.
- Acceptance: anonymous users and unrelated counselors cannot retrieve documents, including via old URLs; authorized owner/admin access expires as intended.

### 2. Calendar failures still become available capacity
- Evidence: `backend/app/services/calendar_service.py:63` returns False on failed free/busy HTTP responses; missing/error calendar payloads default to empty busy slots. The interval helper also returns an empty list on errors. `booking_service.py:73` skips the calendar check entirely when disconnected.
- Consequence: unavailable or revoked integration can yield bookable slots. Catching exceptions in the caller does not help when the callee returns success-shaped results.
- Fix: distinguish free, busy, and unavailable; require a working counselor connection; reject invalid/error provider payloads. Use the same policy for discovery, creation, and rescheduling.
- Acceptance: disconnected calendars, token failure, 403/429/500, malformed replies, and per-calendar errors all prevent protected booking writes.

### 3. Payment and delivery are not durably coordinated
- Evidence: `payment_service.py:131` confirms payment/booking, catches Meet creation failure, commits, and then sends email and schedules jobs. The review endpoint returns early for already-paid payments. `email_service.py:49` can return False on delivery failure, which callers ignore.
- Consequence: payment can be recorded with no meeting link or notification; a retry does not repair delivery. Some failures return success; others return an error after money state has committed.
- Fix: commit payment plus transactional outbox together; provision calendar/email through idempotent retryable jobs. Persist delivery status, event IDs, attempts and errors; provide admin retry actions. Show provisioning state to clients.
- Acceptance: kill/restart the worker at each boundary and simulate provider failure; payment remains correct and delivery eventually retries without duplicate events/emails.

### 4. Cancellation commits refund state separately
- Evidence: `payment_service.py:88` commits `refund_pending`; client/counselor cancellation handlers subsequently set and commit booking cancellation (`routers/bookings.py:375`, `:459`).
- Consequence: a crash or concurrent request can observe a confirmed booking already awaiting refund; the helper's commit releases the caller's locks prematurely.
- Fix: state-changing helpers must not commit independently; cancel booking, create refund obligation and enqueue notifications in one transaction.
- Acceptance: PostgreSQL cancellation/approval/reschedule/refund races and injected failures cannot leave contradictory money/booking states.

### 5. Rescheduling leaves review deadlines and reminders stale
- Evidence: `routers/bookings.py:671` changes start/end without updating `Payment.review_deadline`. Payment approval checks the stored deadline, not the current session start. Reminder tasks only check that the booking is confirmed (`tasks/reminders.py`); rescheduling does not replace their old ETA jobs.
- Consequence: moving a pending review to an earlier session can retain a deadline beyond the new start and allow late approval. Confirmed sessions can receive reminders at the old time.
- Fix: cap review deadline against the new start transactionally and recheck current start on approval. Version/deduplicate reminder jobs against current booking time; update both counselor and client events durably.
- Acceptance: reschedule pending review earlier/later, then approve around both deadlines; old reminder jobs must do nothing.

### 6. Reconciliation cannot complete all money cases
- Evidence: `routers/payment_review.py` rolls back duplicate reference submissions with 409, without recording a claim. Late/expired references cannot be approved; `/refund` only accepts `refund_pending`, with no transition from a verified late transfer to a refund obligation.
- Consequence: administrators can reject these claims but cannot complete the promised received-funds reconciliation/refund workflow. The queue silently stops at 100 records.
- Fix: record claims separately from verified transfers; permit audited correction and late-transfer refund decisions without restoring released bookings. Add queue pagination and reconciliation history.
- Acceptance: duplicate claims, real late transfers, mistaken references, rejection, expired review, and repeated refunds all have explicit terminal outcomes and complete audit trails.

### 7. Counselor eligibility is not consistently rechecked
- Evidence: booking creation checks profile active/verified, but shared `check_counselor_availability` does not. Client rescheduling calls that helper; payment approval does not check current counselor eligibility.
- Consequence: an existing booking can be moved or approved after its counselor is suspended. Blocking that counselor's own protected routes is not enough.
- Fix: enforce active/verified account and profile plus calendar eligibility centrally for creation, rescheduling and approval; define what happens to existing bookings when staff are suspended.
- Acceptance: suspend a counselor between creation, submission, reschedule and approval; each operation follows the defined policy.

## Authentication, abuse and privacy work

8. **Recovery and resend are unfinished.** The login “Forgot password?” target is `#`; implement expiring single-use hashed recovery tokens and OTP resend with generic responses, normalized emails and per-account limits. Test recovery revokes all sessions. Staff recovery/reset needs an audited procedure.
9. **Password schema validation is inconsistent.** Schemas enforce minimum character length, but hashing rejects values over 72 UTF-8 bytes with ValueError. Validate byte length before hashing at signup, invitation and password-change boundaries; return a controlled validation response. Include multibyte passwords in tests.
10. **Email HTML interpolates names without escaping.** `email_service.py:155` and `:247` directly interpolate counselor/client names. Escape dynamic text and validate URLs; test HTML-special characters and malicious links. Review calendar-file escaping separately.
11. **Body timeout is per chunk, not total.** `middleware/body_limit.py` restarts its ten-second timer for every chunk and buffers bodies before route authorization. A trickling client can keep a request alive. Add total request deadlines and infrastructure concurrency/rate controls; test chunked slow bodies and concurrent uploads.
12. **Cross-tab refresh needs a browser concurrency test.** `frontend-landing/src/lib/api.ts` coordinates refresh within one JavaScript instance only; the backend revokes on refresh-token reuse. Two tabs refreshing concurrently can race. This is a code-path risk, not a reproduced browser failure in this review. Add cross-tab coordination and prove replay rejection still works.
13. **Security auditing and CSP remain incomplete.** Current frontend CSP supplies framing/base/object/form restrictions but no script-source policy. Add a tested nonce/hash-based policy compatible with the frontend and providers. Complete structured audit events for sensitive reads, suspension, MFA and payment decisions; scrub provider errors and telemetry of sensitive content.
14. **Hosted abuse controls still need integration evidence.** Verify Redis failure behavior, limits shared by two API processes, account-scoped limits, forged proxy headers and direct-backend access. CAPTCHA checks do not replace these controls. Existing local tests are insufficient to certify bot resistance.

## Frontend correctness

15. **Admin booking UI uses obsolete fields.** `src/app/admin/bookings/[id]/page.tsx:93` reads nested client/counselor names although BookingResponse exposes `client_name` and `counselor_name`; refund status reads a nonexistent `refund_status`. Remove the intake section entirely and use the operational response contract. Ensure detail APIs actually populate the name fields.
16. **Payment page conflates states and invents a fallback amount.** `src/app/payment/success/page.tsx:57` falls back to 300/hour; pending copy still requests transfer within 15 minutes during review. Confirmation promises email delivery without provisioning evidence. Render explicit awaiting-transfer, submitted/review, expired/rejected, reconciliating, confirmed/provisioning and refund states from server data. Never invent a payable amount.
17. **Form and session edge states need end-to-end coverage.** Test expired access cookies, logout in another tab, MFA challenge expiry/replay/recovery, failed CAPTCHA, duplicate clicks, upload failure, pending/rejected counselor onboarding, and offline retries. Current API wrapper returns `any`, which lets response-contract mistakes survive TypeScript checks; introduce typed API responses.
18. **Contact operations remain incomplete.** Add admin inbox, triage state and delivery/retry handling. Verify contact submission actually reaches an operator.
19. **Product/legal content remains a launch dependency.** Fix Terms navigation and confirm real payment/cancellation terms, business contact details, privacy revision date, consent, export/deletion and retention procedures with the owner.

## Deployment/data gates

- Rotate real historical credentials; untracking `.env` does not revoke them. Do not print credential values.
- Preserve old encryption keys and migrate legacy plaintext/ciphertext before deploying strict readers. The presence/extent of affected data was not inspected in this review.
- Replace the mutable initial migration with a reproducible historical baseline; validate upgrade against a protected copy of existing data, in addition to the already-tested fresh database path.
- Add CI for tests, production build, lint/typecheck, secret scan, dependency audits and migration checks.
- Validate same-site HTTPS cookies, exact Origins, trusted proxy configuration, network restrictions, separate environment secrets and readiness checks.
- Run API, worker and one scheduler; verify queue retries, monitoring, backup restoration and real Google/email delivery in staging.
- Complete desktop/mobile browser testing and PostgreSQL money-state concurrency tests. Prior database-constraint tests do not establish that every route transaction is race-safe.

## Recommended order

1. Private credentials, calendar failure handling, counselor eligibility.
2. Atomic cancellation/refunds, review deadline repair and complete reconciliation.
3. Outbox, calendar provisioning, current-time reminders and admin recovery actions.
4. Password recovery/resend and auth/abuse edge cases.
5. Typed frontend contracts, accurate payment states, contact inbox and content.
6. Existing-data migration, deployment controls, staging browser/provider tests and restore drill.

Keep `PUBLIC_LAUNCH_ENABLED=false` until the security, money-handling and operational acceptance gates pass.

## Verification in this review

- Backend regression suite: 31 passed, 1 skipped, 13 warnings. PostgreSQL integration test skipped because its isolated database URL was not supplied. SQLite tests required execution outside the filesystem sandbox; the initial sandboxed attempt was stopped after hanging.
- Frontend `npx tsc --noEmit`: passed.
- Frontend `npm run lint`: zero errors, 25 warnings.
- Production build and dependency audits were previously completed; they were not rerun in this review.
- No live provider calls, deployed browser tests, secret rotation, existing-data migration or restore drill were performed. Passing existing tests does not cover the confirmed missing cases above.
