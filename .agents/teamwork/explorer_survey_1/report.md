# Deployment Readiness Remediation Survey Report — Explorer 1

**Focus Areas**: 
- **Requirement R1**: Proxy-Safe Client IP Rate Limiting & Resilient Celery Background Tasks
- **Requirement R3**: Counselor Security, Onboarding Isolation, & Durable Delivery

**Investigator**: Survey Explorer 1  
**Timestamp**: 2026-10-31T10:27:00Z  
**Project Root**: `/home/scarecrow/dev/booking_system`  
**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_1`

---

## 1. Executive Summary

This survey provides a comprehensive architectural and code-level investigation of the Alaga Counseling backend codebase specifically addressing **Requirement R1** (Render reverse-proxy rate limiting and Celery background task event-loop management) and **Requirement R3** (Counselor email HTML escaping, durable outbox delivery, invite token SHA-256 hashing/lowercasing, and counselor deactivation session revocation/access gating).

All relevant source files, models, schemas, routers, task workers, and existing tests have been inspected line by line. Deficiencies, root causes, exact code locations, proposed implementations, side effects with mitigations, existing test gaps, and exact reproducible verification commands have been mapped out.

---

## 2. Requirement R1: Proxy-Safe Rate Limiting & Resilient Celery Tasks

### 2.1 Component 1: Rate Limiting Behind Render Reverse Proxy

#### A. Current State & Code Inspection
- **`render.yaml`**:
  - Line 9 defines the web service start command:
    ```yaml
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers
    ```
  - *Observation*: The `--no-proxy-headers` flag explicitly prevents Uvicorn from automatically parsing `X-Forwarded-For` or `X-Real-IP`. Consequently, `request.client.host` exposed to FastAPI/Starlette is always the internal IP address of the Render reverse proxy / ingress load balancer.
- **`backend/app/core/rate_limit.py`**:
  - Lines 1–8:
    ```python
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from app.config import settings

    # Proxy headers must be trusted only at the deployment proxy boundary.
    limiter = Limiter(key_func=get_remote_address,
                      storage_uri=settings.REDIS_URL if settings.ENVIRONMENT in {"staging", "production"} else "memory://",
                      default_limits=["120/minute"], swallow_errors=False)
    ```
  - *Vulnerability/Defect*: `limiter` is initialized with `key_func=get_remote_address`. SlowApi's `get_remote_address(request)` returns `request.client.host`.
  - *Impact in Production*: Because Uvicorn receives all traffic from the Render reverse proxy, `request.client.host` is identical for **all** incoming client requests. Every public visitor and client across the internet shares a single rate-limit bucket. When one client exhausts the login limit (5 requests / 15 minutes) or slot check limit (30 requests / minute), **all other legitimate users are locked out with HTTP 429**.
- **`backend/app/config.py`**:
  - Defines `Settings(BaseSettings)` with `ENVIRONMENT: str = "development"`.
  - Currently **lacks** a `TRUST_PROXY_HEADERS` configuration setting.
- **Router Application of `limiter`**:
  - `backend/app/routers/auth.py`:
    - `@limiter.limit("5/15minute")` on `/auth/signup` (L46)
    - `@limiter.limit("10/15minute")` on `/auth/verify-otp` (L98)
    - `@limiter.limit("10/hour")` on `/auth/accept-invite` (L133)
    - `@limiter.limit("5/15minute")` on `/auth/login` (L160)
    - `@limiter.limit("5/15minute")` on `/auth/change-password` (L345)
  - `backend/app/routers/availability.py`:
    - `@limiter.limit("30/minute")` on `/availability/{counselor_id}` (L88)
  - `backend/app/routers/bookings.py`:
    - `@limiter.limit("10/minute")` on `POST /bookings/` (L49)
    - `@limiter.limit("20/minute")` on `POST /bookings/{id}/cancel` (L345)
    - `@limiter.limit("20/minute")` on `POST /bookings/` reschedule (L566)
    - `@limiter.limit("5/minute")` on `GET /bookings/{id}/receipt` (L678)
  - `backend/app/routers/counselors.py`:
    - `@limiter.limit("60/minute")` on `/counselors/me/profile` (L30)
    - `@limiter.limit("5/minute")` on `/counselors/me/photo` (L170)
    - `@limiter.limit("5/minute")` on `/counselors/me/credentials` (L196)
    - `@limiter.limit("30/minute")` on `GET /counselors/` (L257)
    - `@limiter.limit("60/minute")` on `GET /counselors/{id}` (L264)
  - `backend/app/routers/payment_review.py`:
    - `@limiter.limit("5/15minute")` on `/payments/manual/{id}/submit` (L58)
    - `@limiter.limit("20/minute")` on `/payments/manual/{id}/review` (L123)
    - `@limiter.limit("20/minute")` on `GET /payments/manual/claims/queue` (L166)
  - `backend/app/routers/recovery.py`:
    - `@limiter.limit("5/15minute")` on password reset request & verify (L65, L73)
    - `@limiter.limit("10/15minute")` on password reset confirm (L81)

#### B. Proposed Architecture & Implementation
1. **Config Option in `backend/app/config.py`**:
   Add `TRUST_PROXY_HEADERS: bool | None = None` to `Settings`.
   Define a computed property:
   ```python
   @property
   def trust_proxy_headers(self) -> bool:
       if self.TRUST_PROXY_HEADERS is not None:
           return self.TRUST_PROXY_HEADERS
       return self.ENVIRONMENT in {"staging", "production"}
   ```
2. **Proxy-Safe Key Extractor `get_client_ip(request: Request) -> str` in `backend/app/core/rate_limit.py`**:
   - When proxy headers are trusted:
     - Render's ingress proxy appends the real client IP as the **rightmost** element in `X-Forwarded-For`.
     - Direct client requests can include arbitrary spoofed headers like `X-Forwarded-For: 1.2.3.4, 5.6.7.8`. Render appends the true remote address to form `1.2.3.4, 5.6.7.8, <real_client_ip>`.
     - Taking `xff.split(",")[-1].strip()` guarantees that client-spoofed prefix values are ignored.
     - Check Cloudflare headers (`cf-connecting-ip`, `true-client-ip`) if present, then the rightmost IP in `x-forwarded-for`, then `x-real-ip`.
   - When proxy headers are untrusted (local/development/test without override):
     - Ignore all proxy headers completely.
     - Fall back to `request.client.host if request.client else "127.0.0.1"`.
   - Configure `limiter = Limiter(key_func=get_client_ip, ...)` in `rate_limit.py`.

#### C. Potential Pitfalls & Side Effects
- *Pitfall 1 (IP Spoofing)*: Taking the first IP in `X-Forwarded-For` allows attackers to bypass limits by rotating random fake IPs in the request header.
  *Mitigation*: Strictly take the rightmost hop (`parts[-1]`) appended by the trusted infrastructure.
- *Pitfall 2 (NoneType Client)*: ASGI test transports or synthetic requests might provide `request.client = None`.
  *Mitigation*: Guard with `request.client.host if request.client else "127.0.0.1"`.
- *Pitfall 3 (Broken Local Tests)*: If tests run without `X-Forwarded-For` and `TRUST_PROXY_HEADERS` were unconditionally required, tests could fail.
  *Mitigation*: In `development` and `test` environments (`settings.ENVIRONMENT == "test"`), proxy trust defaults to `False`, safely using `request.client.host`.

---

### 2.2 Component 2: Celery Stale-Booking Task Event-Loop Lifecycle

#### A. Current State & Code Inspection
- **`backend/app/celery_app.py`**:
  - Celery Beat schedule (lines 23–26):
    ```python
    "expire-stale-bookings-every-5-minutes": {
        "task": "app.tasks.reminders.expire_stale_bookings_task",
        "schedule": 300.0,  # 5 minutes in seconds
    }
    ```
- **`backend/app/tasks/reminders.py`**:
  - Lines 50–67:
    ```python
    @celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
    def expire_stale_bookings_task():
        """
        Periodic task to sweep and cancel stale pending_payment bookings.
        """
        from app.db.session import AsyncSessionLocal
        from app.services.booking_service import cancel_stale_pending_bookings
        
        async def _sweep():
            async with AsyncSessionLocal() as db:
                return await cancel_stale_pending_bookings(db, max_age_minutes=15)
                
        try:
            count = _run_async(_sweep())
            return f"Swept {count} bookings"
        except Exception as e:
            logger.error("Failed to run stale bookings sweeper: %s", str(e))
            raise
    ```
  - *Observation*:
    1. Line 55 imports `AsyncSessionLocal` from `app.db.session`.
    2. `app.db.session.py` binds `AsyncSessionLocal` to a module-level global engine: `engine = create_async_engine(settings.DATABASE_URL)`.
    3. The Celery worker runs synchronous tasks. To execute the coroutine `_sweep()`, it calls `_run_async(_sweep())`, which invokes `asyncio.run(_sweep())`.
    4. `asyncio.run()` creates a brand-new asyncio event loop, executes the coroutine, and closes the event loop upon completion.
    5. On the first run, the global SQLAlchemy async engine initializes internal connection pools and attaches asyncpg socket handlers / futures to Loop 1.
    6. When Loop 1 closes, those connections retain references to the dead loop.
    7. On the second run (5 minutes later), `asyncio.run()` spins up Loop 2. When `AsyncSessionLocal()` checks out a connection from the global engine, asyncpg attempts to interact with Loop 1's closed futures.
    8. **Crash**: `RuntimeError: Task <...> got Future <...> attached to a different loop` or `RuntimeError: Event loop is closed`.
- **Existing Working Reference in `backend/app/tasks/operations.py`**:
  - Lines 7–23:
    ```python
    @celery_app.task(name="app.tasks.operations.dispatch")
    def dispatch_operations():
        async def run():
            from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
            from app.config import settings
            from app.services.outbox import dispatch
            # Each synchronous Celery task owns its event loop and connections.
            engine = create_async_engine(settings.DATABASE_URL)
            try:
                await dispatch(async_sessionmaker(engine, expire_on_commit=False))
                ...
            finally:
                await engine.dispose()
        asyncio.run(run())
    ```
- **Service Logic in `backend/app/services/booking_service.py`**:
  - Lines 96–142 define `cancel_stale_pending_bookings(db: AsyncSession, max_age_minutes: int = 15) -> int`.
  - Queries `Booking` rows where `status == BookingStatus.pending_payment` and `created_at < cutoff_time` using `.with_for_update(skip_locked=True)`.
  - Skips bookings with payments under active review (`payment.status == PaymentStatus.review` and unexpired review deadline).
  - Transitions eligible bookings to `BookingStatus.cancelled` and payments to `PaymentStatus.failed`.

#### B. Proposed Architecture & Implementation
Refactor `expire_stale_bookings_task` in `backend/app/tasks/reminders.py`:
```python
@celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
def expire_stale_bookings_task():
    """
    Periodic task to sweep and cancel stale pending_payment bookings.
    Each synchronous Celery task invocation owns its event loop and connections.
    """
    async def _sweep():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.config import settings
        from app.services.booking_service import cancel_stale_pending_bookings

        engine = create_async_engine(settings.DATABASE_URL)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with session_factory() as db:
                return await cancel_stale_pending_bookings(db, max_age_minutes=15)
        finally:
            await engine.dispose()

    try:
        count = asyncio.run(_sweep())
        return f"Swept {count} bookings"
    except Exception as e:
        logger.error("Failed to run stale bookings sweeper: %s", str(e))
        raise
```

#### C. Potential Pitfalls & Side Effects
- *Pitfall (Connection Leaks)*: Creating an engine inside `_sweep` without disposing it leaves connection pools open in PostgreSQL.
  *Mitigation*: Enclose session execution in `try ... finally: await engine.dispose()`, guaranteeing 100% pool cleanup before the event loop terminates.
- *Pitfall (Dead code in reminders.py)*: `reminders.py` also contains `send_session_reminder_task` (L35–48) which calls `AsyncSessionLocal()` and is completely unused (reminders are handled by outbox).
  *Mitigation*: Remove `send_session_reminder_task` as part of R4 cleanup.

---

## 3. Requirement R3: Counselor Security, Onboarding Isolation, & Durable Delivery

### 3.1 Component 1: Counselor Email HTML Escaping & Durable Outbox Delivery

#### A. Current State & Code Inspection
- **`backend/app/services/email_service.py`**:
  - `send_counselor_invite_email(email: str, invite_token: str)` (lines 330–345):
    - Constructs link: `link = f"{settings.FRONTEND_URL}/counselor/setup?token={invite_token}"`.
    - Embeds `{link}` into `html_body` without `escape()`.
  - `send_counselor_rejection_email(email: str, reason: str = "")` (lines 347–375):
    - Lines 356–360:
      ```python
      reason_section = (
          f"<p><strong>Reason:</strong> {reason}</p>"
          if reason
          else ""
      )
      ```
    - Embeds `reason` **directly without HTML escaping**.
    - *Vulnerability*: Stored XSS / HTML Injection. If an administrator enters `<img src=x onerror=...>` or arbitrary HTML markup in the rejection reason query parameter (`POST /admin/counselors/{id}/reject?reason=...`), the raw HTML is sent to the recipient's mail client.
- **`backend/app/routers/admin.py`**:
  - `invite_counselor` (lines 116–118):
    ```python
    from app.services.email_service import send_counselor_invite_email
    import asyncio
    asyncio.create_task(send_counselor_invite_email(data.email, invite_token))
    ```
  - `reject_counselor` (lines 169–174):
    ```python
    from app.services.email_service import send_counselor_rejection_email
    import asyncio
    if counselor.user and counselor.user.email:
        asyncio.create_task(
            send_counselor_rejection_email(counselor.user.email, reason or "")
        )
    ```
  - *Vulnerability/Reliability Flaw*: Both endpoints use `asyncio.create_task` fire-and-forget in-memory tasks. If the process is killed during deployment, worker restart, or if Gmail API throws a transient error (rate limit, network blip), the email is lost without any retry or audit trail.
- **`backend/app/services/outbox.py`**:
  - Contains reliable outbox engine with transactional leasing (`lease_token`, `lease_until`), exponential backoff retries (up to 8 attempts), and error logging.
  - Currently dispatches `reset_email`, `otp_email`, `payment_instructions_email`, `calendar`, `confirmation_email`, `cancellation_email`, and `reminder`.
  - **Currently missing**: `counselor_invite_email` and `counselor_rejection_email`.

#### B. Proposed Architecture & Implementation
1. **HTML Escaping in `email_service.py`**:
   - In `send_counselor_rejection_email`:
     ```python
     escaped_reason = escape(reason) if reason else ""
     reason_section = f"<p><strong>Reason:</strong> {escaped_reason}</p>" if escaped_reason else ""
     ```
   - In `send_counselor_invite_email`:
     Escape the generated URL: `<a href="{escape(link, quote=True)}">{escape(link)}</a>`.
2. **Outbox Handlers in `backend/app/services/outbox.py`**:
   - In `execute(db, job)`:
     ```python
     elif job.kind == "counselor_invite_email":
         token = job.payload.get("raw_token")
         if not token and "encrypted_secret" in job.payload:
             token = decrypt_token(job.payload["encrypted_secret"])
         await email.send_counselor_invite_email(job.payload["email"], token)
     elif job.kind == "counselor_rejection_email":
         await email.send_counselor_rejection_email(
             job.payload["email"], job.payload.get("reason", "")
         )
     ```
   - In `dispatch()` payload sanitization:
     Ensure secret is cleared once processed:
     ```python
     if "encrypted_secret" in job.payload:
         job.payload = {"email": job.payload.get("email")}
     ```
3. **Queueing in `backend/app/routers/admin.py`**:
   - In `invite_counselor`:
     Replace `asyncio.create_task` with:
     ```python
     from app.services.outbox import enqueue
     from app.core.encryption import encrypt_token
     await enqueue(
         db,
         f"counselor_invite:{new_user.id}",
         "counselor_invite_email",
         {
             "email": normalized_email,
             "encrypted_secret": encrypt_token(invite_token),
         },
     )
     ```
   - In `reject_counselor`:
     Replace `asyncio.create_task` with:
     ```python
     from app.services.outbox import enqueue
     if counselor.user and counselor.user.email:
         await enqueue(
             db,
             f"counselor_rejection:{counselor.id}:{datetime.now(timezone.utc).timestamp()}",
             "counselor_rejection_email",
             {
                 "email": counselor.user.email,
                 "reason": reason or "",
             },
         )
     ```

---

### 3.2 Component 2: Counselor Invite Token SHA-256 Hashing & Email Lowercasing

#### A. Current State & Code Inspection
- **`backend/app/models/user.py`**:
  - Lines 44–45:
    ```python
    invite_token = Column(String, nullable=True)
    invite_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    ```
  - Stored as plaintext string in database.
- **`backend/app/routers/admin.py`**:
  - `invite_counselor` (lines 83–105):
    - `data.email` is not lowercased before lookup or storage.
    - `invite_token = secrets.token_urlsafe(32)` is generated and stored directly into `new_user.invite_token = invite_token`.
    - If database reads are compromised or leaked via logs/backups, usable invite tokens can be stolen.
- **`backend/app/routers/auth.py`**:
  - `accept_invite` (lines 136–140):
    ```python
    result = await db.execute(select(User).where(func.lower(User.email) == str(data.email).strip().lower()))
    user = result.scalar_one_or_none()
    
    if not user or user.invite_token != data.token:
        raise HTTPException(status_code=400, detail="Invalid token or email")
    ```
    Performs direct plaintext equality check on `user.invite_token != data.token`.

#### B. Proposed Architecture & Implementation
1. **Email Normalization**:
   In `admin.py`:
   ```python
   normalized_email = str(data.email).strip().lower()
   result = await db.execute(select(User).where(func.lower(User.email) == normalized_email))
   if result.scalar_one_or_none():
       raise HTTPException(status_code=400, detail="Email already registered")
   ```
2. **SHA-256 Hashing at Rest**:
   In `admin.py`:
   ```python
   raw_invite_token = secrets.token_urlsafe(32)
   token_hash = hashlib.sha256(raw_invite_token.encode("utf-8")).hexdigest()
   new_user = User(
       email=normalized_email,
       full_name=data.full_name,
       password_hash=get_password_hash(temp_password),
       role=RoleEnum.counselor,
       is_verified=False,
       invite_token=token_hash,
       invite_token_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
   )
   ```
3. **Backward-Compatible Verification in `auth.py` (`accept_invite`)**:
   ```python
   incoming_token = str(data.token).strip()
   incoming_hash = hashlib.sha256(incoming_token.encode("utf-8")).hexdigest()

   is_token_valid = False
   if user and user.invite_token:
       # Accept both new SHA-256 hash and in-flight legacy plaintext tokens
       is_token_valid = (
           secrets.compare_digest(user.invite_token, incoming_hash)
           or secrets.compare_digest(user.invite_token, incoming_token)
       )

   if not user or not is_token_valid:
       raise HTTPException(status_code=400, detail="Invalid token or email")
   ```

#### C. Potential Pitfalls & Side Effects
- *Pitfall*: Existing test fixtures or pending tokens in dev databases might fail if only hashed tokens are checked.
  *Mitigation*: The `secrets.compare_digest` fallback to `incoming_token` guarantees 100% backward compatibility for all unhashed tokens created prior to deployment.

---

### 3.3 Component 3: Counselor Deactivation Session Revocation & Access Enforcement

#### A. Current State & Code Inspection
- **`backend/app/routers/admin.py`**:
  - `deactivate_counselor` (lines 186–210):
    ```python
    @router.post("/counselors/{counselor_id}/deactivate", response_model=dict)
    async def deactivate_counselor(
        counselor_id: str,
        current_user: User = Depends(require_role(["admin"])),
        db: AsyncSession = Depends(get_db),
    ):
        result = await db.execute(
            select(CounselorProfile).where(CounselorProfile.id == counselor_id)
        )
        counselor = result.scalar_one_or_none()

        if not counselor:
            raise HTTPException(status_code=404, detail="Counselor not found")

        counselor.is_active = False
        await db.commit()

        logger.info("Admin %s deactivated counselor %s", current_user.id, counselor_id)

        return {"msg": "Counselor deactivated.", "counselor_id": counselor_id}
    ```
    *Flaws*:
    1. It does NOT revoke active authentication sessions (`AuthSession` in `backend/app/services/sessions.py`).
    2. It does NOT record an `AuditEvent` (`action="counselor.deactivate"`).
- **`backend/app/services/sessions.py`**:
  - Contains `revoke_all(db, user_id)`:
    ```python
    async def revoke_all(db, user_id):
        await db.execute(update(AuthSession).where(AuthSession.user_id == user_id).values(revoked=True))
    ```
    This function is already used in `auth.py` (line 359) and `recovery.py` (line 92), but was omitted in `deactivate_counselor`.
- **`backend/app/core/security.py`**:
  - Lines 82–87 in `get_current_user`:
    ```python
    if user.role.value == "counselor" and not request.url.path.startswith(("/counselors/me", "/calendar/", "/auth/")):
        from app.models.counselor_profile import CounselorProfile
        profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))).scalar_one_or_none()
        if not profile or not profile.is_active or not profile.is_verified:
            raise HTTPException(status_code=403, detail="Counselor is not active")
    return user
    ```
    *Security Bypass*:
    Notice `and not request.url.path.startswith(("/counselors/me", "/calendar/", "/auth/"))`.
    When an admin deactivates a verified counselor (`counselor.is_verified == True` and `counselor.is_active = False`), the check above is **completely bypassed** for any route starting with `/counselors/me` or `/calendar/`!
    The deactivated counselor can still:
    - Update bio, tags, photo: `PUT /counselors/me/profile`, `POST /counselors/me/photo`
    - Upload documents: `POST /counselors/me/credentials`
    - Manage calendar integrations: `/calendar/google/login`, `/calendar/google/callback`

#### B. Onboarding vs Deactivated Distinction
Why was that exemption in `security.py` originally?
Because newly invited counselors have:
- `User.is_verified = True` (after accepting invite)
- `CounselorProfile.is_verified = False` (pending admin approval)
- `CounselorProfile.is_active = False`
They **must** be able to access `/counselors/me` and `/calendar/` to submit their profile and credentials and connect their calendar!
Once verified by admin (`verify_counselor`), `profile.is_verified = True` and `profile.is_active = True`.
When deactivated by admin (`deactivate_counselor`), `profile.is_verified` remains `True`, but `profile.is_active` becomes `False`.

#### C. Proposed Architecture & Implementation
1. **Revoke Sessions & Log Audit Event in `backend/app/routers/admin.py`**:
   In `deactivate_counselor`:
   ```python
   from app.services.sessions import revoke_all
   from app.models.operations import AuditEvent

   counselor.is_active = False
   await revoke_all(db, counselor.user_id)
   db.add(
       AuditEvent(
           actor_id=current_user.id,
           target_id=counselor.user_id,
           action="counselor.deactivate",
           outcome="deactivated",
       )
   )
   await db.commit()
   ```
2. **Access Enforcement in `backend/app/core/security.py` (`get_current_user`)**:
   ```python
   if user.role.value == "counselor":
       from app.models.counselor_profile import CounselorProfile
       profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))).scalar_one_or_none()
       if not profile:
           raise HTTPException(status_code=403, detail="Counselor profile not found")

       # Deactivated verified counselor: block all access except auth session inspection / logout
       if profile.is_verified and not profile.is_active:
           if request.url.path not in {"/auth/me", "/auth/logout"}:
               raise HTTPException(status_code=403, detail="Your counselor account has been deactivated")

       # Unverified onboarding counselor: only allow onboarding and auth paths
       elif not profile.is_verified:
           if not request.url.path.startswith(("/counselors/me", "/calendar/", "/auth/")):
               raise HTTPException(status_code=403, detail="Counselor is not active")
   ```

---

## 4. Existing Test Coverage and Test Gaps

### 4.1 Existing Backend Tests
The existing test suite in `backend/tests/` contains 13 test files with 51 collected items:
- `test_auth.py` (4 tests): Signup, verify login flow, rate limiting on `/auth/signup`, unauthorized routes.
- `test_bookings.py` (2 tests): Booking hold, conflict rejection, cancellation via service, timezone slot consistency.
- `test_counselor_import.py` (3 tests): Seed deduplication, invalid JSON, transaction rollback.
- `test_followup_security.py` (4 tests): Security headers and token hygiene.
- `test_hardening.py` (5 tests): Password hashing, encryption rotation.
- `test_ledger_and_reconciliation.py` (4 tests): Payment claims, ledger tracking.
- `test_mfa.py` (7 tests): MFA enrollment, totp verification, recovery codes.
- `test_operations.py` (8 tests): Password reset outbox, recovery tokens, retry sanitization.
- `test_payments.py` (2 tests): Payment creation, status tracking.
- `test_postgres_constraints.py` (1 test): Concurrent overlap rejection and hold constraints against PostgreSQL (skipped unless `ALAGA_POSTGRES_TEST_URL` is set).
- `test_release_flows.py` (9 tests): PKCE RFC7636, payment deadlines, idempotent refunds, OAuth state.
- `test_security.py` (2 tests): Simulate success production block, unauthenticated access.

### 4.2 Test Gaps for R1
- **Rate limiting proxy isolation**:
  - `test_auth.py::test_rate_limiting` tests raw count (5 requests -> 6th returns 429) on a single IP without `X-Forwarded-For`.
  - **Gap**: Zero tests for `get_client_ip` proxy header parsing.
  - **Gap**: Zero tests verifying that spoofed prefixes (`X-Forwarded-For: 1.1.1.1, <client_ip>`) are ignored and only the rightmost IP isolates the bucket.
  - **Gap**: Zero tests verifying fallback to `request.client.host` when `TRUST_PROXY_HEADERS=False`.
- **Celery stale-booking lifecycle**:
  - `test_bookings.py` tests `cancel_stale_pending_bookings(db)` directly.
  - **Gap**: Zero tests invoking `expire_stale_bookings_task()`.
  - **Gap**: Zero tests running `expire_stale_bookings_task()` consecutively across multiple `asyncio.run()` invocations to prove absence of event-loop mismatch and absence of connection pool leaks.

### 4.3 Test Gaps for R3
- **Counselor emails**:
  - **Gap**: Zero tests for `send_counselor_rejection_email` HTML escaping of malicious strings (e.g. `<script>alert(1)</script>`).
  - **Gap**: Zero tests for `invite_counselor` and `reject_counselor` enqueuing outbox jobs (`counselor_invite_email`, `counselor_rejection_email`).
- **Counselor invite token**:
  - **Gap**: Zero tests for `invite_counselor` lowercasing email.
  - **Gap**: Zero tests verifying `user.invite_token` in DB contains a 64-char hex SHA-256 digest rather than plaintext.
  - **Gap**: Zero tests verifying `accept_invite` accepts the raw token corresponding to the hash.
  - **Gap**: Zero tests verifying backward compatibility for pre-existing unhashed invite tokens.
- **Counselor deactivation & RBAC**:
  - **Gap**: Zero tests for `deactivate_counselor` calling `revoke_all`.
  - **Gap**: Zero tests for `AuditEvent` logged with `action="counselor.deactivate"`.
  - **Gap**: Zero tests verifying a deactivated verified counselor is blocked from `/counselors/me/profile`, `/counselors/me/credentials`, and `/calendar/google/login`.
  - **Gap**: Zero tests verifying an unverified onboarding counselor can still access `/counselors/me/profile` and `/calendar/google/login`.

---

## 5. Recommended Implementation Plan & Specific Code Changes

| Requirement | Target File | Action | Details |
|---|---|---|---|
| **R1** Rate Limiting | `backend/app/config.py` | Add `TRUST_PROXY_HEADERS: bool \| None = None` | Add property `trust_proxy_headers` defaulting to `ENVIRONMENT in {"staging", "production"}`. |
| **R1** Rate Limiting | `backend/app/core/rate_limit.py` | Implement `get_client_ip(request: Request) -> str` | Read rightmost untrusted hop from `X-Forwarded-For` or `X-Real-IP` if proxy headers trusted; else fallback to `request.client.host`. Pass to `Limiter(key_func=get_client_ip, ...)`. |
| **R1** Celery Task | `backend/app/tasks/reminders.py` | Refactor `expire_stale_bookings_task()` | Inside `_sweep()`, create dedicated `AsyncEngine` and `async_sessionmaker`, execute `cancel_stale_pending_bookings`, and `await engine.dispose()` inside `finally:`. |
| **R3** HTML Escaping | `backend/app/services/email_service.py` | Sanitize `reason` and links with `html.escape` | Escape `reason` in `send_counselor_rejection_email` and `link` in `send_counselor_invite_email`. |
| **R3** Outbox Delivery | `backend/app/services/outbox.py` | Add handlers in `execute()` | Handle `counselor_invite_email` (decrypting secret) and `counselor_rejection_email`. Clear sensitive payload after delivery. |
| **R3** Outbox Queueing | `backend/app/routers/admin.py` | Replace `asyncio.create_task` with `outbox.enqueue` | Enqueue `counselor_invite_email` and `counselor_rejection_email` transactionally with `db`. |
| **R3** Token Hashing & Email | `backend/app/routers/admin.py` | Normalize email & hash token | `normalized_email = data.email.strip().lower()`. Store `hashlib.sha256(raw_token.encode()).hexdigest()` in `User.invite_token`. |
| **R3** Accept Invite | `backend/app/routers/auth.py` | Verify token hash with backward compat | Compare `incoming_hash` or `raw_token` against `user.invite_token` via `secrets.compare_digest`. |
| **R3** Counselor Deactivation | `backend/app/routers/admin.py` | Revoke sessions & log audit event | Call `await revoke_all(db, counselor.user_id)` and insert `AuditEvent(action="counselor.deactivate")`. |
| **R3** Security RBAC | `backend/app/core/security.py` | Gated route check in `get_current_user` | Block `profile.is_verified and not profile.is_active` counselors on all routes except `/auth/me` and `/auth/logout` with 403. Allow `not profile.is_verified` onboarding counselors on `/counselors/me` and `/calendar/`. |

---

## 6. Required Verification Commands

### 6.1 Backend Verification
1. **Live PostgreSQL Suite (0 failed, 0 skipped)**:
   ```bash
   # 1. Start ephemeral PostgreSQL cluster on port 5433
   mkdir -p /tmp/pg_test && initdb -D /tmp/pg_test -U alaga --auth=trust
   pg_ctl -D /tmp/pg_test -o "-p 5433 -k /tmp -h 127.0.0.1" start
   createdb -h 127.0.0.1 -p 5433 -U alaga alaga_test

   # 2. Run Alembic migrations against test database
   cd /home/scarecrow/dev/booking_system/backend
   DATABASE_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" .venv/bin/alembic upgrade head

   # 3. Run full pytest suite including PostgreSQL constraint test
   ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" PYTHONPATH=. .venv/bin/pytest tests/

   # 4. Stop and clean up ephemeral cluster
   pg_ctl -D /tmp/pg_test stop
   rm -rf /tmp/pg_test
   ```
2. **Dedicated Regression Tests to Add**:
   - `tests/test_rate_limit.py`: Proxy header isolation, spoofed prefix rejection, fallback to client host.
   - `tests/test_celery_lifecycle.py`: Multi-run `expire_stale_bookings_task` across consecutive `asyncio.run()` calls.
   - `tests/test_counselor_security.py`: HTML escaping in rejection email, outbox job queueing, SHA-256 token hashing and accept invite flow, deactivated counselor session revocation and 403 route blocking vs onboarding counselor access.

### 6.2 Frontend Verification
1. **TypeScript Typecheck**:
   ```bash
   cd /home/scarecrow/dev/booking_system/frontend-landing
   npx tsc --noEmit
   ```
   *(Exits with 0 errors)*
2. **ESLint**:
   ```bash
   cd /home/scarecrow/dev/booking_system/frontend-landing
   npm run lint
   ```
   *(Exits with 0 errors, 18 existing warnings)*
3. **Production Webpack Build**:
   ```bash
   cd /home/scarecrow/dev/booking_system/frontend-landing
   npm run build
   ```
   *(Exits with 0 errors, produces compiled Next.js routes)*
