import asyncio
import base64
import logging
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
    message["From"] = "Alaga Counseling <no-reply@alaga.com>"
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


async def send_booking_confirmation(user_email: str, booking_id: str) -> None:
    """
    Sends a booking confirmation email after a payment is successfully processed.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the confirmed booking.
    """
    subject = "Your Session is Confirmed! ✅"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Booking Confirmed</h2>
        <p>Great news! Your counseling session has been paid and confirmed.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        <p>You will receive a separate email with your session details and meeting link.</p>
        <p>We look forward to seeing you!</p>
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


async def send_session_reminder(
    user_email: str, booking_id: str, hours_before: int
) -> None:
    """
    Sends a session reminder email to a client N hours before their session.

    Args:
        user_email: The client's email address.
        booking_id: The unique ID of the upcoming booking.
        hours_before: How many hours until the session (e.g., 24 or 1).
    """
    time_label = "24 hours" if hours_before >= 24 else "1 hour"
    subject = f"Reminder: Your Counseling Session is in {time_label}"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Session Reminder</h2>
        <p>This is a friendly reminder that your counseling session is coming up in <strong>{time_label}</strong>.</p>
        <p><strong>Booking ID:</strong> {booking_id}</p>
        <p>Please make sure you are in a quiet, private space before the session begins.</p>
        <p>Your meeting link was included in your confirmation email. If you need assistance, contact support.</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)
