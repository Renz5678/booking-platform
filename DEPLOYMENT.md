# Restricted staging rollout

Use a new Render Blueprint instance from `render.yaml`, a new PostgreSQL database and a separate Vercel project/environment. Retain the old synthetic database until the new environment passes validation. No infrastructure is provisioned by merely adding this file.

Create the `alaga-secrets` Render environment group before deployment. Set DATABASE_URL using the internal PostgreSQL connection, replacing the scheme with `postgresql+asyncpg://`. Set REDIS_URL to the internal key-value URL. Supply unique JWT_SECRET and ENCRYPTION_KEY (at least 32 random characters), ENVIRONMENT=staging, FRONTEND_URL, BACKEND_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RECAPTCHA_SECRET_KEY, RECAPTCHA_SITE_KEY, GCASH_NUMBER, GCASH_NAME, ADMIN_EMAIL and CLOUDINARY_URL. GOOGLE_REFRESH_TOKEN is the email sender credential; counselor calendars use their own connections. Never reuse production secrets in staging. Keep PUBLIC_LAUNCH_ENABLED=false.

Set Vercel's root directory to `frontend-landing`, build command `npm run build`, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_RECAPTCHA_SITE_KEY and optional monitoring DSN. Use frontend/API custom domains under the same parent domain. CSP starts in report-only mode; enforce with CSP_ENFORCE=true only after checking CAPTCHA, navigation, images and monitoring in staging.

The blueprint intentionally provisions paid workers/cache/database. Review the account's costs before provisioning. The API migration command runs before serving requests. The baseline is frozen SQL; never regenerate it after deployment. Future schema changes require forward migrations.

The API currently ignores forwarded headers. Before release, configure trusted proxy handling using the provider's current documented network boundary; never accept arbitrary forwarded headers or `*`. Verify that rate limiting uses the intended address from the real deployment. Direct application protection remains required. This deployment-specific IP validation remains a release gate.

Run the counselor importer in dry-run mode first; see `backend/data/README.md`. Import only approved synthetic staging accounts initially. New counselor profiles require staff MFA enrollment, calendar connection, credential upload and admin approval. Provision the first administrator with the controlled operator command; never run demo seeds on a hosted environment.

The worker processes durable jobs. One Beat scheduler dispatches every minute and expires holds. `/admin/operations` lists failed delivery jobs and the contact inbox; `/admin/payments` and `/admin/reconciliation` manage money decisions. A failed job is logged with its identifier and sanitized error class. Configure external alerts on `delivery_failure`, worker downtime, elevated 5xx, queue age and review deadlines. Dashboards and logs alone are not automatic alerts.

Email jobs provide at-least-once delivery: a provider timeout after accepting an email can cause a duplicate on retry. Calendar creation uses deterministic IDs and retrieves existing events after conflict. Test worker interruption before and after every provider call. Reminder jobs validate current schedule version before sending.

## Restore drill

1. Produce an encrypted database backup through the managed provider; keep access restricted and record its retention/expiry. Preserve encryption/signing credentials in the secret manager, independently from the database dump.
2. Restore into a separate isolated database with outbound email/calendar disabled. Point an isolated test API at the restore.
3. Verify account counts, booking/payment/claim history, encrypted data decryption, outbox records and MFA configuration. Confirm revoked sessions stay revoked.
4. Record duration and operator in the release checklist. Destroy the isolated restore after review. Never overwrite the active database to conduct a drill.

## External operations still required

Rotate real credentials found in historical commits through each provider, configure real domains and network restrictions, verify real Gmail/Calendar/Cloudinary delivery, validate the Render blueprint in the owning account, connect alerts, run browser/mobile flows and execute the restore drill. Confirm business contacts, payment/cancellation terms, consent, retention/export/deletion and incident procedures. No compliance claim is implied.

Legacy credential objects: the application no longer serves their URLs. Before launch, inventory public objects under `counselor_credentials` in Cloudinary, upload replacements through the private flow, verify authorized downloads, then delete old public objects with CDN invalidation. Do not delete objects before confirming replacements; application authorization cannot revoke an already-public URL.
