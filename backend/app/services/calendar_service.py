from datetime import datetime
import logging
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)
MANILA_TZ = ZoneInfo("Asia/Manila")


def to_manila(dt: datetime) -> datetime:
    """Normalizes a datetime to Asia/Manila (+08:00), treating naive values as Manila local time."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=MANILA_TZ)
    return dt.astimezone(MANILA_TZ)


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

async def get_google_calendar_busy_intervals(
    refresh_token: str | None, start_time: datetime, end_time: datetime
) -> list[tuple[datetime, datetime]]:
    """
    Queries Google Calendar freeBusy endpoint and returns busy intervals in Asia/Manila.
    """
    if not refresh_token:
        return []

    access_token = await get_google_access_token(refresh_token)
    url = "https://www.googleapis.com/calendar/v3/freeBusy"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    start_manila = to_manila(start_time)
    end_manila = to_manila(end_time)

    payload = {
        "timeMin": start_manila.isoformat(),
        "timeMax": end_manila.isoformat(),
        "timeZone": "Asia/Manila",
        "items": [{"id": "primary"}],
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            logger.warning("Failed to fetch Google Calendar freeBusy: %s", response.text)
            return []

        data = response.json()
        busy_slots = data.get("calendars", {}).get("primary", {}).get("busy", [])
        intervals: list[tuple[datetime, datetime]] = []
        for item in busy_slots:
            raw_start = item.get("start")
            raw_end = item.get("end")
            if not raw_start or not raw_end:
                continue
            b_start = to_manila(datetime.fromisoformat(raw_start.replace("Z", "+00:00")))
            b_end = to_manila(datetime.fromisoformat(raw_end.replace("Z", "+00:00")))
            intervals.append((b_start, b_end))
        return intervals


async def check_google_calendar_busy(refresh_token: str, start_time: datetime, end_time: datetime) -> bool:
    """
    Queries Google Calendar freeBusy endpoint to check if the counselor is busy.
    Returns True if busy, False if available.
    """
    busy_intervals = await get_google_calendar_busy_intervals(refresh_token, start_time, end_time)
    return len(busy_intervals) > 0


async def create_google_meet_event(summary: str, start_time: datetime, end_time: datetime, booking_id: str, refresh_token: str | None = None) -> tuple[str, str | None]:
    """
    Creates a Google Calendar event with a Google Meet link attached.
    Returns a tuple of (hangout_link, event_id).
    event_id is None if the event could not be created.
    """
    token_to_use = refresh_token or settings.GOOGLE_REFRESH_TOKEN
    if not token_to_use:
        # Fallback if no refresh token is provided
        return "https://meet.google.com/mock-link", None

    access_token = await get_google_access_token(token_to_use)
    
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Normalize to Asia/Manila before sending to Google API
    start_manila = to_manila(start_time)
    end_manila = to_manila(end_time)

    event_data = {
        "summary": summary,
        "description": f"Booking ID: {booking_id}",
        "start": {
            "dateTime": start_manila.isoformat(),
            "timeZone": "Asia/Manila",
        },
        "end": {
            "dateTime": end_manila.isoformat(),
            "timeZone": "Asia/Manila",
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
        hangout_link = data.get("hangoutLink", "https://meet.google.com/mock-link")
        event_id = data.get("id")  # Store the event ID for future updates/deletes
        return hangout_link, event_id



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
    start_manila = to_manila(start_time)
    end_manila = to_manila(end_time)

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
            "dateTime": start_manila.isoformat(),
            "timeZone": "Asia/Manila",
        },
        "end": {
            "dateTime": end_manila.isoformat(),
            "timeZone": "Asia/Manila",
        },
    }

    # Include Meet link as a hangout link if available
    if meet_link:
        event_data["hangoutLink"] = meet_link

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=event_data, headers=headers)
        if response.status_code not in (200, 201):
            logger.error("Failed to add event to user calendar: %s", response.text)


async def delete_calendar_event(refresh_token: str | None, event_id: str) -> None:
    access_token = await get_google_access_token(refresh_token)
    url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient() as client:
        response = await client.delete(url, headers=headers)
        if response.status_code not in (204, 404):
            logger.error("Failed to delete Google Calendar event %s: %s", event_id, response.text)


async def update_calendar_event(
    refresh_token: str | None, event_id: str, new_start: datetime, new_end: datetime
) -> None:
    access_token = await get_google_access_token(refresh_token)
    url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    start_manila = to_manila(new_start)
    end_manila = to_manila(new_end)

    event_data = {
        "start": {"dateTime": start_manila.isoformat(), "timeZone": "Asia/Manila"},
        "end": {"dateTime": end_manila.isoformat(), "timeZone": "Asia/Manila"},
    }
    async with httpx.AsyncClient() as client:
        response = await client.patch(url, json=event_data, headers=headers)
        if response.status_code != 200:
            logger.error("Failed to update Google Calendar event %s: %s", event_id, response.text)

