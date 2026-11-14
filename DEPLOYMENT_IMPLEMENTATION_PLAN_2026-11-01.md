# Deployment implementation plan — 2026-11-01

Status: do not open public production access yet. Keep PUBLIC_LAUNCH_ENABLED=false.

This plan follows a read-only audit of the current working tree, including its existing uncommitted and untracked remediation. Application code was not changed. Expected load: a small public counseling service with concurrent clients, multiple API/worker processes, one scheduler, and persistent booking history. No measured traffic target was supplied.

## Verified baseline

- Backend: 112 passed, zero skipped, 16 warnings with an isolated PostgreSQL database available. Most fixtures still use SQLite; the two PostgreSQL-specific tests use PostgreSQL. This is not evidence that every endpoint was tested against PostgreSQL.
- An empty temporary PostgreSQL database migrated successfully to e1f2a3b4c5d6. The temporary server was stopped afterward. Existing production-data upgrades and backup restores were not exercised.
- Frontend: TypeScript, ESLint (zero errors, 18 warnings), and production webpack build passed.
- Python locked dependency audit: no known vulnerabilities reported by pip-audit --no-deps --disable-pip.
- npm audit: 20 moderate affected-package entries, including transitive glob/minimatch advisories. No high/critical entries reported. The high-severity CI threshold exits successfully despite these findings. Do not apply the proposed forced downgrades blindly.
- Targeted synthetic checks reproduced lost reviewer fields after database reload, MultipleResultsFound with two transfers for one booking, and calendar PATCH/DELETE HTTP 503 being returned as success.
- Initial sandboxed SQLite tests hung; the suite passed outside that sandbox. This was not classified as an application failure.

## Finding index

1. Payment status effect refetches immediately whenever it stores a new claims object, including terminal states.
2. Transfers are one-to-many per booking, but summary/cancellation/refund queries assume one; transfer refunds can also update the wrong booking-payment obligation.
3. Incoming and outgoing transfer references are not globally protected against reuse in both directions.
4. Reconciliation allocation can extend an expired hold before the periodic sweeper runs.
5. Rejecting one reference rejects unrelated claims; allocated claims can remain stranded after expiry/counselor cancellation.
6. Calendar PATCH/DELETE failures are logged and acknowledged instead of retried.
7. Deactivated counselors retain sessions and access to exempt profile/upload/calendar endpoints.
8. Counselor invitations/rejections bypass durable delivery; invite tokens are stored raw and acceptance is not atomically consumed.
9. Claim reviewer/time and audit metadata exist only in memory, not mapped database columns.
10. Concurrent failed logins can overwrite the same attempt counter.
11. Admin date filters use UTC rather than Manila day boundaries.
12. Admin bookings load all history, including intake records the response intentionally excludes; authenticated reads also take unnecessary row locks.
13. Slot listings suppress Calendar failures and advertise unverified availability.
14. Moderate frontend dependency advisories need resolution or documented reachability assessment.
15. Test and readiness evidence overstates coverage; browser polling, durable audit reloads and money races are not covered.
16. Unused email-verification JWT helpers, the obsolete reminder task and unused secure dependency can be removed.

## Phase 1 — stop request flooding (finding 1)

Files: frontend-landing/src/app/payment/success/page.tsx; focused frontend regression test.

- Separate the initial fetch from timed polling. Depend on stable primitive state, not the response object that the effect itself replaces.
- Schedule one next request after the previous request finishes. Stop on terminal state/unmount and prevent overlapping requests.
- Preserve the existing authoritative claims endpoint and network-error behavior.

Acceptance: a successful pending response does not trigger another immediate request; five seconds triggers one request pair; terminal responses stop polling; slow requests never overlap; unmount stops requests. Verify with a browser network trace or a fake-timer component test.

## Phase 2 — repair the money state transitions (findings 2–5, 9)

Files: backend/app/routers/payment_review.py, backend/app/services/payment_service.py, backend/app/routers/bookings.py, backend/app/services/booking_service.py, backend/app/models/operations.py, a new forward Alembic migration, frontend-landing/src/lib/contracts.ts, payment success/detail/admin reconciliation pages, backend/tests/test_ledger_and_reconciliation.py.

- Keep multiple actual transfers per booking. Query the transfer associated with the payment reference/claim when changing that payment; return a collection of refunds to clients where multiple obligations exist. Do not add uniqueness on booking_id: that would hide legitimate extra transfers.
- Refunding an extra transfer must not mark the original booking payment refunded. Use consistent lock order across booking, payment, claim and transfer writers to avoid opposite-order deadlocks.
- Validate references against both incoming and refund references on every money write. Serialize competing writes for the same normalized reference (for example a shared PostgreSQL transaction advisory lock), then enforce the checks inside that transaction. Existing per-column unique constraints remain useful but insufficient.
- Check actual hold/review deadlines during allocation, independent of the sweeper. The queue eligibility flag and mutation must use the same rule. Do not extend a deadline merely by assigning a claim.
- Reject only the claim/reference being decided. Leave independent corrected/extra-transfer claims open for reconciliation.
- On cancellation/expiry, move unfulfilled allocated claims into a visible reconciliation state; ensure client state cannot say under_review forever for a cancelled booking.
- Persist reviewer ID/time with real columns. If audit context is retained, map it to a separately named JSON column such as details; do not shadow SQLAlchemy metadata with a transient Python attribute.
- Remove production branches that accommodate AsyncMock objects and swallowed claim-update errors after fixing the tests to model real sessions correctly.

Acceptance tests, using separate database sessions where relevant:

1. Two distinct real transfers for one booking: summary succeeds and both obligations remain visible.
2. A paid booking plus an extra-transfer refund: the extra refund does not settle the booking's cancellation refund.
3. An outgoing reference cannot later be approved as incoming; concurrent opposing writes cannot both commit.
4. A 16-minute-old unpaid hold cannot be allocated, even before the sweeper runs.
5. Reject reference A while a distinct claim B is open: B stays actionable.
6. Allocate, then expire/cancel: funds remain in a visible queue and client state matches.
7. Review in session A, close it, reload in session B: reviewer, timestamp and audit details survive.
8. Concurrent approve/cancel/refund decisions preserve one financial result and retryable conflicts, without silently dropping records.

Migration acceptance: fresh install and upgrade of an isolated populated fixture both pass. Preserve all money history. Backfill only data supported by existing records; do not invent historic reviewers or timestamps.

## Phase 3 — enforce account lifecycle boundaries (findings 7, 8, 10)

Files: backend/app/core/security.py, backend/app/routers/admin.py, backend/app/routers/auth.py, backend/app/services/sessions.py, backend/app/services/outbox.py, backend/app/services/email_service.py, relevant auth/counselor tests.

- Revoke sessions in the same transaction as counselor deactivation. Explicitly distinguish an inactive onboarding profile from a suspended previously verified counselor. Block suspended accounts from protected profile/upload/calendar actions; allow logout.
- Store only a hash of invitation tokens. Normalize invite emails. Consume invitations once under a lock or atomic database operation; two concurrent acceptances must not both set a password.
- Queue invite/rejection emails in the existing transactional outbox, committing the account decision and job together. Encrypt secret-bearing delivery payloads and erase them after delivery/expiry, following existing OTP/reset behavior.
- Escape the rejection reason when rendering HTML. A reason containing markup must be displayed as text.
- Replace read/increment/write login counters with a locked or atomic update so simultaneous failures are all counted.

Acceptance: an already signed-in suspended counselor cannot upload, edit profile, reconnect Calendar or refresh into useful access; legitimate onboarding still works; worker restart does not lose an invite; no raw invite token is stored in User; concurrent acceptance has one winner; concurrent failed logins trigger account lockout; tests use separate PostgreSQL transactions.

## Phase 4 — reliable external operations and scheduling (findings 6, 11, 13)

Files: backend/app/services/calendar_service.py, backend/app/services/outbox.py, backend/app/services/availability_service.py, backend/app/routers/admin.py, associated tests.

- Raise on failed Calendar PATCH/DELETE calls so the outbox retries and eventually exposes exhausted delivery. Treat already-deleted events as idempotent success, including Google's documented 410 case where appropriate.
- Do not mark provisioning ready or send updated confirmation before external updates succeed.
- Return an explicit unavailable response when live Calendar availability cannot be checked; do not fabricate free slots. Keep the authoritative live check on booking/reschedule.
- Convert Manila date boundaries to UTC once and use an exclusive next-day upper bound in admin filtering.

Acceptance: simulated 429/503 updates/deletes remain retryable; repeated deletion succeeds safely; revocation of Calendar access surfaces a useful failure; Manila midnight and 23:59 sessions appear on the intended date. After fixtures pass, repeat with synthetic accounts against real providers.

Provider reference: https://developers.google.com/workspace/calendar/api/guides/errors

## Phase 5 — bounded queries, dependency cleanup and evidence (findings 12, 14–16)

Files: admin/bookings routers and callers, backend/app/services/sessions.py, backend/app/tasks/reminders.py, backend/app/services/auth_service.py, backend/tests/conftest.py, backend dependency manifests, frontend dependency manifests, CI and release documentation.

- Paginate admin booking history and update its frontend caller. Stop loading intake forms for admin lists. Review client/counselor history pagination using the same existing list pattern.
- Remove booking FOR UPDATE from read-only detail/ICS/receipt routes. Separate ordinary session validation from mutation paths that require a lock; preserve refresh rotation, MFA and revocation correctness.
- Review the dependency audit's actual paths. Choose compatible patched versions when available, rebuild and retest; if upstream remains affected, document which untrusted inputs can reach the vulnerable glob operations and the temporary disposition. No blind npm audit fix --force.
- Delete the unused verification JWT helpers (~17 lines), obsolete reminder helper/task (~34 lines), related mock, and unused secure dependency. Drain any preexisting legacy Celery tasks before deleting their registered handler. Keep google-auth-oauthlib: backend/scripts/get_gmail_token.py uses it.
- Add the regression tests above rather than duplicating implementation details. Replace inaccurate mocks that produce unawaited-coroutine warnings.
- Add staging-mode middleware/startup checks and a narrow real-browser journey for login/MFA, booking/payment states, rescheduling, cancellation, private documents and admin money decisions. The ordinary suite disables rate limiting and mocks providers, so it cannot prove these controls together.
- Update RELEASE_READINESS.md and PROJECT.md from the exact release commit and actual command output. Do not describe all tests as PostgreSQL tests when most fixtures are SQLite.

Acceptance: no regressions in the existing suite; new failure-path tests pass; frontend typecheck/lint/build pass; advisory status is recorded accurately; list queries are bounded; no sensitive intake load in admin listing.

## Phase 6 — external release gates

These are unverified operations, not claims that the live system is compromised.

1. Review and commit the intended working tree, including currently untracked migrations, routes, CI and deployment files. Deploy the tested commit; current HEAD does not contain all audited code.
2. Git history contains a root .env with nonempty credential fields. Determine which were real and rotate/revoke those through the providers. Preserve encrypted-data access during encryption-key rotation using the existing legacy-key mechanism and a tested migration. Never publish secret values in evidence.
3. Validate Render/Vercel configuration in the owning accounts, HTTPS same-site custom domains, cookie behavior and restricted database/cache networks. Verify trusted forwarding-header behavior empirically: current code trusts the rightmost X-Forwarded-For whenever enabled without checking the peer. Test spoofed headers and direct/internal access; do not infer safety from the YAML comment.
4. Verify Gmail sender authorization, counselor Google OAuth/Meet creation and Cloudinary private uploads/downloads. Inventory any legacy public credential objects, verify private replacements, then invalidate old public objects.
5. Verify one Beat scheduler, working workers, real Redis rate limits, queue-age/failed-job alerts and the response procedure. Demonstrate an alert firing; a dashboard is not an alert.
6. Restore an encrypted backup to a separate isolated database with outbound providers disabled. Confirm encrypted intake, MFA data, revoked sessions and money history remain usable. Record recovery time and key custody.
7. Finalize actual business contact details, cancellation/refund terms, privacy/retention/export/deletion procedures and incident ownership. This audit does not certify legal compliance.
8. Exercise synthetic end-to-end journeys in restricted staging. The current launch gate blocks all /bookings and /payments routes, including reads and admin manual-payment routes; test with a network-restricted staging environment before enabling its flag. Do not use production customers for verification.
9. Enable public production access only after findings 1–11 and all release gates are resolved, with findings 12–15 completed or explicitly bounded by documented operating limits. Rollback planning must keep access to existing bookings/refunds: setting the current launch gate false blocks their management too.

## Scope limits

Reviewed the application entry points, auth/MFA/recovery, counselor lifecycle/uploads, availability, booking/payment/refund flows, Calendar/email/outbox/sweeper, operational endpoints, models/migrations, frontend auth/API/payment paths, tests and deployment configuration. Did not read every presentational component or design export line by line. No live penetration test, real provider calls, production data inspection, measured load test, complete secret-history scanner, existing-data migration, or backup restore was performed. No application code or infrastructure was changed.
