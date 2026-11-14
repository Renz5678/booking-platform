## 2026-10-31T10:34:29Z
You are Explorer 3 for Milestone 1 (R1: Proxy Rate Limiting & Celery Task Sweeper).
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_3
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read /home/scarecrow/dev/booking_system/PROJECT.md and survey findings in /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_1/report.md.

Your task:
Analyze and formulate the exact test strategy for Milestone 1:
1. Regression test for proxy rate limiting:
   - Unit test for get_client_ip verifying rightmost hop extraction, prefix spoofing prevention, fallback to request.client.host, and behavior with TRUST_PROXY_HEADERS=True vs False.
   - Integration / router rate limiting test showing two requests with different rightmost IPs receive independent limits.
2. Regression test for Celery stale bookings task:
   - Test invoking expire_stale_bookings_task() repeatedly (at least 3 consecutive calls) in the same process to verify no event-loop mismatch or database connection errors occur.
   - Verify proper cleanup.

Write your test specifications to /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_3/handoff.md.
When finished, send a message to caller with summary and path to your handoff.
