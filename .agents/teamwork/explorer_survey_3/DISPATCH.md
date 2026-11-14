# Dispatch for Survey Explorer 3

- Target: Survey codebase for R4 (Lock hygiene, admin query bounds, Google Calendar cache, analytics, dead code removal, and frontend copy) and test environment verification.
- Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_3
- Mandatory reading:
  - /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md
  - /home/scarecrow/.gemini/antigravity/brain/ff5305fd-6c5f-4101-8296-a0eaa6b1ae5a/implementation_plan.md

## 2026-10-31T10:18:26Z
[Message] timestamp=2026-10-31T10:18:26Z sender=62dea6a7-bac7-44d1-817c-a55079e79dee priority=MESSAGE_PRIORITY_HIGH content=You are Survey Explorer 3 for the deployment readiness remediation project.
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_3
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read the reference implementation plan at:
/home/scarecrow/.gemini/antigravity/brain/ff5305fd-6c5f-4101-8296-a0eaa6b1ae5a/implementation_plan.md

Your task:
Perform a comprehensive read-only survey of the codebase focusing on:
1. Requirement R4:
   - Database lock hygiene: inspect backend/app/routers/bookings.py (get_booking, download_booking_ics, download_booking_receipt) and backend/app/services/booking_service.py. Check with_for_update() usage on read-only endpoints.
   - Admin bookings query bounds, intake form decryption, date filters: inspect backend/app/routers/admin.py (get_all_bookings), schemas in backend/app/schemas/admin.py, selectinload(Booking.intake_form), limit/offset pagination, and timezone filtering in Asia/Manila. Check frontend-landing/src/app/admin/bookings/page.tsx to confirm response contract compatibility.
   - Google Calendar freeBusy short-TTL caching: inspect backend/app/services/availability_service.py, backend/app/routers/bookings.py (get_available_slots vs create_booking live checks), cache invalidation on booking/calendar updates, and test environment bypass.
   - Admin analytics revenue accuracy: inspect backend/app/routers/admin.py (get_analytics), total_revenue and revenue_by_counselor calculations.
   - Dead code and dependency cleanup: inspect backend/app/tasks/reminders.py (send_session_reminder_task), backend/app/services/auth_service.py (unused functions), backend/requirements.txt (secure, google-auth-oauthlib), and confirm whether PayMongo code is unmounted.
   - Frontend UI copy: inspect frontend-landing/src/app/dashboard/bookings/[id]/page.tsx client cancellation modal copy.
2. Test Execution Environment:
   - How backend tests are run (pytest command, pytest.ini/conftest.py, PostgreSQL test database connection and lifecycle).
   - How frontend typechecking (npx tsc --noEmit), linting (npm run lint), and building (npm run build) are configured.

Produce a detailed report at /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_3/report.md:
- Current state of code and files touched
- Existing test coverage and gaps for R4
- Test environment details (PostgreSQL requirements, environment variables, commands)
- Recommended implementation details and potential pitfalls / side effects
- Required verification commands

When finished, send a completion message back to your caller with a summary and the path to your report.
