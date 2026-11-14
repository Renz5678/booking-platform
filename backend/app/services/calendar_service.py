from datetime import datetime

import httpx
from fastapi import HTTPException

import logging
from app.config import settings

logger = logging.getLogger(__name__)


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
    
    async with httpx.AsyncClient(timeout=10.0) as client:
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
        raise HTTPException(503, "Calendar availability unavailable")
        
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
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise HTTPException(503, "Calendar availability unavailable")
            
        data = response.json()
        calendars = data.get("calendars", {})
        primary_cal = calendars.get("primary", {})
        if primary_cal.get("errors") or not isinstance(primary_cal.get("busy"), list):
            raise HTTPException(503, "Calendar availability unavailable")
        busy_slots = primary_cal.get("busy", [])
        
        return len(busy_slots) > 0


async def get_google_calendar_busy_intervals(refresh_token: str, start_time: datetime, end_time: datetime) -> list[tuple[datetime, datetime]]:
    """Returns a list of (start, end) datetime tuples representing busy periods from Google Calendar."""
    if not refresh_token:
        raise HTTPException(503, "Calendar availability unavailable")
    try:
        access_token = await get_google_access_token(refresh_token)
    except Exception as e:
        logger.warning("Could not fetch Google Calendar access token: %s", e)
        raise HTTPException(503, "Calendar availability unavailable")

    from datetime import timezone
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    url = "https://www.googleapis.com/calendar/v3/freeBusy"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "timeMin": start_time.isoformat(),
        "timeMax": end_time.isoformat(),
        "items": [{"id": "primary"}]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(503, "Calendar availability unavailable")
            data = resp.json()
            primary = data.get("calendars", {}).get("primary", {})
            if primary.get("errors") or not isinstance(primary.get("busy"), list):
                raise HTTPException(503, "Calendar availability unavailable")
            busy_list = primary["busy"]
            intervals = []
            for b in busy_list:
                s = datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
                e = datetime.fromisoformat(b["end"].replace("Z", "+00:00"))
                intervals.append((s, e))
            return intervals
    except Exception as e:
        logger.warning("Failed to query Google Calendar freeBusy: %s", e)
        raise HTTPException(503, "Calendar availability unavailable")


async def create_google_meet_event(summary: str, start_time: datetime, end_time: datetime, booking_id: str, refresh_token: str | None = None) -> tuple[str, str | None]:
    """
    Creates a Google Calendar event with a Google Meet link attached.
    Returns a tuple of (hangout_link, event_id).
    event_id is None if the event could not be created.
    """
    token_to_use = refresh_token or settings.GOOGLE_REFRESH_TOKEN
    if not token_to_use:
        # Fallback if no refresh token is provided
        raise RuntimeError("Counselor calendar connection is required")

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
    else:
        start_time = start_time.astimezone(timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    else:
        end_time = end_time.astimezone(timezone.utc)

    import hashlib
    deterministic_id = hashlib.sha256(("alaga:" + booking_id).encode()).hexdigest()
    event_data = {
        "id": deterministic_id,
        "summary": summary,
        "description": f"Booking ID: {booking_id}",
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "Asia/Manila",
        },
        "end": {
            "dateTime": end_time.isoformat(),
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
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=event_data, headers=headers)
        if response.status_code == 409:
            response = await client.get("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + deterministic_id, headers=headers)
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=503, detail="Calendar provisioning unavailable")
        
        data = response.json()
        hangout_link = data.get("hangoutLink")
        if not hangout_link:
            raise RuntimeError("Google Meet provisioning is incomplete")
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
    from datetime import timezone
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    else:
        start_time = start_time.astimezone(timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    else:
        end_time = end_time.astimezone(timezone.utc)

    access_token = await get_google_access_token(refresh_token)
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    import hashlib
    deterministic_id = hashlib.sha256(("alaga-client:" + booking_id).encode()).hexdigest()
    event_data = {
        "id": deterministic_id,
        "summary": summary,
        "description": f"Booking ID: {booking_id}\nJoin here: {meet_link or ''}",
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "Asia/Manila",
        },
        "end": {
            "dateTime": end_time.isoformat(),
            "timeZone": "Asia/Manila",
        },
    }

    # Include Meet link as a hangout link if available
    if meet_link:
        event_data["hangoutLink"] = meet_link

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=event_data, headers=headers)
        if response.status_code == 409:
            response = await client.get(url + "/" + deterministic_id, headers=headers)
        if response.status_code not in (200, 201):
            raise RuntimeError("Client calendar provisioning failed")
        return deterministic_id


async def delete_calendar_event(refresh_token: str, event_id: str) -> None:
    access_token = await get_google_access_token(refresh_token)
    url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(url, headers=headers)
        if response.status_code not in (204, 404):
            logger.error("Failed to delete Google Calendar event %s: %s", event_id, response.text)

async def update_calendar_event(refresh_token: str, event_id: str, new_start: datetime, new_end: datetime) -> None:
    access_token = await get_google_access_token(refresh_token)
    url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    from datetime import timezone
    if new_start.tzinfo is None:
        new_start = new_start.replace(tzinfo=timezone.utc)
    else:
        new_start = new_start.astimezone(timezone.utc)
    if new_end.tzinfo is None:
        new_end = new_end.replace(tzinfo=timezone.utc)
    else:
        new_end = new_end.astimezone(timezone.utc)
        
    event_data = {
        "start": {
            "dateTime": new_start.isoformat(),
            "timeZone": "Asia/Manila",
        },
        "end": {
            "dateTime": new_end.isoformat(),
            "timeZone": "Asia/Manila",
        }
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(url, json=event_data, headers=headers)
        if response.status_code != 200:
            logger.error("Failed to update Google Calendar event %s: %s", event_id, response.text)

