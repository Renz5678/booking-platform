import asyncio
import base64
from email.message import EmailMessage
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.config import settings

def _get_gmail_service():
    if not settings.GOOGLE_REFRESH_TOKEN:
        print("WARNING: GOOGLE_REFRESH_TOKEN is not set. Emails will not be sent.")
        return None
    
    creds = Credentials(
        None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET
    )
    return build('gmail', 'v1', credentials=creds)

def _send_email_sync(to_email: str, subject: str, html_body: str):
    service = _get_gmail_service()
    if not service:
        return
    
    message = EmailMessage()
    message.set_content("Please enable HTML to view this email.")
    message.add_alternative(html_body, subtype='html')
    message['To'] = to_email
    message['From'] = "Alaga Counseling <no-reply@alaga.com>"
    message['Subject'] = subject
    
    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
    create_message = {'raw': encoded_message}
    
    try:
        service.users().messages().send(userId="me", body=create_message).execute()
        print(f"Email sent successfully to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")

async def send_verification_email(user_email: str, token: str):
    """
    Sends a verification email with the token.
    """
    verification_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    subject = "Verify your Alaga account"
    
    html_body = f"""
    <html>
      <body>
        <h2>Welcome to Alaga Counseling!</h2>
        <p>Please click the link below to verify your email address:</p>
        <p><a href="{verification_link}">{verification_link}</a></p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)

async def send_booking_confirmation(user_email: str, booking_id: str):
    """
    Sends a booking confirmation email.
    """
    subject = "Your Session is Confirmed!"
    
    html_body = f"""
    <html>
      <body>
        <h2>Booking Confirmed</h2>
        <p>Your booking (ID: {booking_id}) has been paid and confirmed.</p>
        <p>We look forward to seeing you!</p>
      </body>
    </html>
    """
    await asyncio.to_thread(_send_email_sync, user_email, subject, html_body)
