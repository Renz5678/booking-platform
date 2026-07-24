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


async def send_verification_email(user_email: str, token: str) -> None:
    """
    Sends an account verification email to a newly registered user.

    The email contains a secure, time-limited link that points to our
    frontend's /verify-email page with the JWT token as a query parameter.

    Args:
        user_email: The recipient's email address.
        token: The signed JWT verification token.
    """
    verification_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    subject = "Verify your Alaga account"

    html_body = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Welcome to Alaga Counseling!</h2>
        <p>Please click the button below to verify your email address.
           This link will expire in 24 hours.</p>
        <p>
          <a href="{verification_link}"
             style="display:inline-block;padding:12px 24px;background:#4f46e5;
                    color:#fff;text-decoration:none;border-radius:6px;">
            Verify My Email
          </a>
        </p>
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
