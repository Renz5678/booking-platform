import asyncio
import base64
import logging
from datetime import datetime, timezone
from email.message import EmailMessage

from google.auth.exceptions import GoogleAuthError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings

# Use Python's standard logger instead of print() for production-grade logging.
# This allows log level filtering, file output, and structured logging in the future.
logger = logging.getLogger(__name__)

# The Google OAuth2 token endpoint — this is a public, well-known constant URL,
# not a secret. Bandit may flag it as a "hardcoded password" but it is safe to suppress.
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"  # nosec B106


def _get_gmail_service():
    """
    Builds and returns an authenticated Gmail API service client.

    Returns None if the GOOGLE_REFRESH_TOKEN is not configured,
    allowing the app to start and function without email sending (e.g., in testing).
    """
    if not settings.GOOGLE_REFRESH_TOKEN:
        logger.warning(
            "GOOGLE_REFRESH_TOKEN is not configured. Email sending is disabled."
        )
        return None

    # Construct OAuth2 credentials using our stored refresh token.
    # The access token (first arg) is None because we rely on the refresh token
    # to automatically obtain a new access token when needed.
    creds = Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
    )
    return build("gmail", "v1", credentials=creds)


def _send_email_sync(to_email: str, subject: str, html_body: str) -> bool:
    """
    Synchronously sends an HTML email via the Gmail API.

    This is a blocking function intentionally designed to be run inside
    asyncio.to_thread() so it doesn't block the async event loop.

    Returns True on success, False on failure.
    """
    service = _get_gmail_service()
    if not service:
        return False

    # Build a MIME message with a plain-text fallback for email clients
    # that do not support HTML (e.g., some corporate email readers).
    message = EmailMessage()
    message.set_content("Please enable HTML to view this email.")
    message.add_alternative(html_body, subtype="html")
    message["To"] = to_email
    message["From"] = "Alaga Counseling <no-reply@alaga.ph>"
    message["Subject"] = subject

    # Gmail API requires the message to be base64url-encoded before sending.
    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    try:
        service.users().messages().send(
            userId="me", body={"raw": encoded_message}
        ).execute()
        logger.info("Email sent successfully to %s", to_email)
        return True
    except HttpError as e:
        # Catch specific Gmail API HTTP errors (e.g., quota exceeded, invalid recipient)
        logger.error("Gmail API HttpError sending to %s: %s", to_email, e)
        return False
    except GoogleAuthError as e:
        # Catch specific Google authentication errors (e.g., refresh token revoked)
        logger.error("Google Auth error sending to %s: %s", to_email, e)
        return False


async def send_verification_email(user_email: str, otp: str) -> None:
    """
    Sends an account verification email containing a 6-digit OTP to a newly registered user.
    """
    subject = "Verify your Alaga account"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Welcome to Alaga Counseling!</h2>
        <p>Your 6-digit verification code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 4px; color: #4f46e5;">{otp}</h1>
        <p>Please enter this code in the app to verify your email address.
           This code will expire in 15 minutes.</p>
        <p style="color:#888;font-size:12px;">
          If you did not create an account, you can safely ignore this email.
        </p>
      </body>
    </html>
    """
    # Run the blocking Gmail API call in a thread pool to avoid blocking the event loop.
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)


async def send_booking_confirmation(
    user_email: str,
    booking_id: str,
    counselor_name: str,
    session_start: datetime,
    session_end: datetime,
    meeting_link: str,
) -> None:
    """
    Sends a booking confirmation email after a payment is successfully processed.
    Includes the Google Meet link, a Google Calendar deep link, and an ICS download link.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the confirmed booking.
        counselor_name: Name of the counselor.
        session_start: Session start time.
        session_end: Session end time.
        meeting_link: Google Meet link.
    """
    subject = "Your Session is Confirmed! ✅"

    start_str = session_start.strftime("%Y-%m-%d %I:%M %p UTC")

    # Generate an 'Add to Google Calendar' deep link
    gcal_link = generate_google_calendar_link(
        title=f"Counseling Session with {counselor_name}",
        start=session_start,
        end=session_end,
        location=meeting_link or "Online",
    )

    # ICS download is served by the backend API
    # ICS download is served by the backend API — use BACKEND_URL, not FRONTEND_URL
    ics_url = f"{settings.BACKEND_URL.rstrip('/')}/bookings/{booking_id}/ics"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Booking Confirmed ✅</h2>
        <p>Great news! Your counseling session has been paid and confirmed.</p>
        <p><strong>Counselor:</strong> {counselor_name}</p>
        <p><strong>Session Time:</strong> {start_str}</p>
        <p><strong>Meeting Link:</strong> <a href="{meeting_link}">{meeting_link}</a></p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p>
          <a href="{gcal_link}" style="background:#4285F4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;margin-right:10px;">📅 Add to Google Calendar</a>
          <a href="{ics_url}" style="background:#f5f5f5;color:#333;padding:10px 18px;border-radius:6px;text-decoration:none;border:1px solid #ddd;">⬇️ Download .ics (Apple / Outlook)</a>
        </p>
        <p style="margin-top:20px;">We look forward to seeing you!</p>
      </body>
    </html>
    """
    # Run the blocking Gmail API call in a thread pool to avoid blocking the event loop.
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)


async def send_cancellation_email(
    user_email: str, booking_id: str, refund_issued: bool
) -> None:
    """
    Sends a booking cancellation confirmation email to the client.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the cancelled booking.
        refund_issued: Whether a refund was issued for this cancellation.
    """
    subject = "Your Booking Has Been Cancelled"
    refund_note = (
        "<p>A full refund has been processed and will appear in your account within 3–7 business days.</p>"
        if refund_issued
        else "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
    )

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Booking Cancelled</h2>
        <p>Your counseling session booking has been cancelled.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        {refund_note}
        <p>If you have any questions, please contact our support team.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)


async def send_counselor_cancellation_notification(
    client_email: str, booking_id: str
) -> None:
    """
    Notifies a client that their counselor has cancelled the session.
    A full refund is always issued in this case.

    Args:
        client_email: The client's email address.
        booking_id: The unique ID of the cancelled booking.
    """
    subject = "Important: Your Counselor Has Cancelled Your Session"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Session Cancelled by Counselor</h2>
        <p>We're sorry to inform you that your counselor has had to cancel your upcoming session.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        <p>A full refund has been processed and will appear in your account within 3–7 business days.</p>
        <p>You may book a new session with any available counselor at your convenience.</p>
        <p>We apologize for any inconvenience caused.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, client_email, subject, html_body)


async def send_admin_cancellation_alert(
    booking_id: str, counselor_name: str, client_name: str
) -> None:
    """
    Notifies the admin when a counselor cancels a session.
    """
    if not settings.ADMIN_EMAIL:
        return
        
    subject = "Alert: Counselor Cancelled Session"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Counselor Cancellation Alert</h2>
        <p>Counselor <strong>{counselor_name}</strong> has cancelled a session with client <strong>{client_name}</strong>.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, settings.ADMIN_EMAIL, subject, html_body)


async def send_session_reminder(
    user_email: str, booking_id: str, hours_before: int, meeting_link: str = ""
) -> None:
    """
    Sends a session reminder email to a client N hours before their session.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the upcoming booking.
        hours_before: How many hours until the session (e.g., 24 or 1).
        meeting_link: The Google Meet link for the session.
    """
    time_label = "24 hours" if hours_before >= 24 else "1 hour"
    subject = f"Reminder: Your Counseling Session is in {time_label}"

    meet_section = (
        f'<p><strong>Meeting Link:</strong> <a href="{meeting_link}">{meeting_link}</a></p>'
        if meeting_link
        else "<p>Your meeting link was included in your confirmation email.</p>"
    )

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Session Reminder ⏰</h2>
        <p>This is a friendly reminder that your counseling session is coming up in <strong>{time_label}</strong>.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        {meet_section}
        <p>Please make sure you are in a quiet, private space before the session begins.</p>
        <p>If you need assistance, contact our support team.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)


def generate_ics_content(title: str, start: datetime, end: datetime, location: str, description: str) -> str:
    """Generates an .ics file content."""
    dtstart = start.strftime('%Y%m%dT%H%M%SZ')
    dtend = end.strftime('%Y%m%dT%H%M%SZ')
    dtstamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    
    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Alaga Counseling//EN
BEGIN:VEVENT
UID:{dtstamp}-{start.strftime('%Y%m%d')}@alaga.ph
DTSTAMP:{dtstamp}
DTSTART:{dtstart}
DTEND:{dtend}
SUMMARY:{title}
DESCRIPTION:{description}
LOCATION:{location}
END:VEVENT
END:VCALENDAR"""
    return ics

def generate_google_calendar_link(title: str, start: datetime, end: datetime, location: str) -> str:
    """Generates a Google Calendar 'Add to Calendar' link."""
    dtstart = start.strftime('%Y%m%dT%H%M%SZ')
    dtend = end.strftime('%Y%m%dT%H%M%SZ')
    import urllib.parse
    
    base_url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
    params = f"&text={urllib.parse.quote(title)}&dates={dtstart}/{dtend}&location={urllib.parse.quote(location)}"
    return base_url + params


async def send_counselor_invite_email(email: str, invite_token: str) -> None:
    subject = "You've been invited to Alaga Counseling"
    link = f"{settings.FRONTEND_URL}/counselor/setup?token={invite_token}"
    html_body = f"""
    <html>
      <body>
        <h2>Counselor Invitation</h2>
        <p>You have been invited to join Alaga Counseling as a counselor.</p>
        <p>Please click the link below to set up your account:</p>
        <a href="{link}">{link}</a>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, email, subject, html_body)


async def send_counselor_rejection_email(email: str, reason: str = "") -> None:
    """
    Notifies a counselor applicant that their application was not approved.

    Args:
        email: The counselor's email address.
        reason: Optional rejection reason provided by the admin.
    """
    subject = "Update on Your Alaga Counselor Application"
    reason_section = (
        f"<p><strong>Reason:</strong> {reason}</p>"
        if reason
        else ""
    )
    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Application Update</h2>
        <p>Thank you for your interest in joining Alaga Counseling as a licensed counselor.</p>
        <p>After careful review, we are unable to approve your application at this time.</p>
        {reason_section}
        <p>If you believe this was an error or would like further clarification, please reach out to our support team.</p>
        <p>We appreciate your interest and wish you all the best.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, email, subject, html_body)


async def send_payment_pending_email(
    user_email: str,
    booking_id: str,
    amount: float,
) -> None:
    """
    Sends a GCash payment instruction email to a client after creating a booking.
    Instructs them to manually send the payment to the counselor's GCash account.
    The slot is held for 15 minutes — counselor confirms once payment is received.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the pending booking (used as payment reference).
        amount: The amount to pay in PHP.
    """
    from app.config import settings

    gcash_number = settings.GCASH_NUMBER or "[GCash number not configured]"
    gcash_name = settings.GCASH_NAME or "Alaga Counseling"

    subject = "Action Required — Complete Your GCash Payment to Confirm Booking"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Almost there! 📋</h2>
        <p>Your booking slot is <strong>reserved for 15 minutes</strong>. Please send your GCash payment now to confirm.</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
          <tr style="background: #f9fafb;">
            <td style="padding: 14px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb; width: 40%;">GCash Number</td>
            <td style="padding: 14px 16px; font-size: 20px; letter-spacing: 2px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">{gcash_number}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb;">Account Name</td>
            <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb;">{gcash_name}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 14px 16px; font-weight: bold; color: #374151; border-bottom: 1px solid #e5e7eb;">Amount</td>
            <td style="padding: 14px 16px; font-size: 22px; color: #16a34a; font-weight: bold; border-bottom: 1px solid #e5e7eb;">PHP {amount:,.2f}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; font-weight: bold; color: #374151;">Reference / Note</td>
            <td style="padding: 14px 16px; font-family: monospace; letter-spacing: 1px; font-size: 13px; color: #4f46e5;">{booking_id}</td>
          </tr>
        </table>

        <div style="padding: 14px 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
          ⚠️ <strong>Important:</strong> Enter your <strong>Booking ID</strong> as the GCash note/message so your payment can be matched to your booking. Your slot will be automatically released if payment is not confirmed within 15 minutes.
        </div>

        <p>Once your counselor verifies the payment, you will receive a confirmation email with your session details and Google Meet link.</p>

        <p style="color: #9ca3af; font-size: 12px;">If you did not create this booking, please ignore this email.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)

