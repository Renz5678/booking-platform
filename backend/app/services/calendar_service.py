from datetime import datetime

import httpx
from fastapi import HTTPException

from app.config import settings


async def get_google_access_token(refresh_token: str | None = None) -> str:
    """Gets a new access token using the refresh token."""
    token_to_use = refresh_token or settings.GOOGLE_REFRESH_TOKEN
    if not token_to_use:
        raise HTTPException(status_code=500, detail="No Google Refresh Token available")
        
    url = "https://oauth2.googleapis.com/token"
    payload = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": token_to_use,
        "grant_type": "refresh_token"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get Google Access Token")
        data = response.json()
        return data["access_token"]

async def check_google_calendar_busy(refresh_token: str, start_time: datetime, end_time: datetime) -> bool:
    """
    Queries Google Calendar freeBusy endpoint to check if the counselor is busy.
    Returns True if busy, False if available.
    """
    if not refresh_token:
        return False
        
    access_token = await get_google_access_token(refresh_token)
    url = "https://www.googleapis.com/calendar/v3/freeBusy"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Ensure timezone info exists
    from datetime import timezone
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
        
    payload = {
        "timeMin": start_time.isoformat(),
        "timeMax": end_time.isoformat(),
        "items": [{"id": "primary"}]
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            return False
            
        data = response.json()
        calendars = data.get("calendars", {})
        primary_cal = calendars.get("primary", {})
        busy_slots = primary_cal.get("busy", [])
        
        return len(busy_slots) > 0


async def create_google_meet_event(summary: str, start_time: datetime, end_time: datetime, booking_id: str, refresh_token: str | None = None) -> str:
    """
    Creates a Google Calendar event with a Google Meet link attached.
    Returns the Meet link (hangoutLink).
    """
    token_to_use = refresh_token or settings.GOOGLE_REFRESH_TOKEN
    if not token_to_use:
        # Fallback if no refresh token is provided
        return "https://meet.google.com/mock-link"

    access_token = await get_google_access_token(token_to_use)
    
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Ensure timezone info exists before sending to Google API
    from datetime import timezone
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

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


async def add_event_to_calendar(
    summary: str,
    start_time: datetime,
    end_time: datetime,
    booking_id: str,
    meet_link: str | None,
    refresh_token: str
) -> None:
    """
    Adds a session event (with an existing Meet link) to a user's Google Calendar.
    Used to sync to the client's calendar after the counselor's event is created.
    """
    from datetime import timezone
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    access_token = await get_google_access_token(refresh_token)
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    event_data = {
        "summary": summary,
        "description": f"Booking ID: {booking_id}\nJoin here: {meet_link or ''}",
        "start": {
            "dateTime": start_time.isoformat()
        },
        "end": {
            "dateTime": end_time.isoformat()
        },
    }

    # Include Meet link as a hangout link if available
    if meet_link:
        event_data["hangoutLink"] = meet_link

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=event_data, headers=headers)
        if response.status_code not in (200, 201):
            print(f"Failed to add event to user calendar: {response.text}")

