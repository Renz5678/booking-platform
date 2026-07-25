from datetime import datetime
import httpx
from fastapi import HTTPException

from app.config import settings

async def get_google_access_token() -> str:
    """Gets a new access token using the refresh token."""
    url = "https://oauth2.googleapis.com/token"
    payload = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": settings.GOOGLE_REFRESH_TOKEN,
        "grant_type": "refresh_token"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get Google Access Token")
        data = response.json()
        return data["access_token"]

async def create_google_meet_event(summary: str, start_time: datetime, end_time: datetime, booking_id: str) -> str:
    """
    Creates a Google Calendar event with a Google Meet link attached.
    Returns the Meet link (hangoutLink).
    """
    if not settings.GOOGLE_REFRESH_TOKEN:
        # Fallback if no refresh token is provided
        return "https://meet.google.com/mock-link"

    access_token = await get_google_access_token()
    
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    event_data = {
        "summary": summary,
        "description": f"Booking ID: {booking_id}",
        "start": {
            "dateTime": start_time.isoformat()
        },
        "end": {
            "dateTime": end_time.isoformat()
        },
        "conferenceData": {
            "createRequest": {
                "requestId": str(booking_id),
                "conferenceSolutionKey": {
                    "type": "hangoutsMeet"
                }
            }
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=event_data, headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to create Google Calendar event: {response.text}")
        
        data = response.json()
        return data.get("hangoutLink", "https://meet.google.com/mock-link")
