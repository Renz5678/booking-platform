"""Bound request bodies before FastAPI parses JSON or multipart data."""
import asyncio
import time
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            return await self.app(scope, receive, send)
        upload = scope["path"] in {"/counselors/me/photo", "/counselors/me/credentials"}
        maximum = 11 * 1024 * 1024 if upload else 64 * 1024
        chunks, size = [], 0
        deadline = time.monotonic() + 30
        while True:
            try:
                message = await asyncio.wait_for(receive(), timeout=max(0.001, min(10, deadline - time.monotonic())))
            except asyncio.TimeoutError:
                return await JSONResponse({"detail": "Request body timed out"}, status_code=408)(scope, receive, send)
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > maximum:
                return await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body, consumed = b"".join(chunks), False

        async def bounded_receive():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, bounded_receive, send)
