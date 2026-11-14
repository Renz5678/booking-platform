from fastapi import Request, status
from fastapi.responses import JSONResponse


class AlagaException(Exception):
    """Base exception for all custom Alaga exceptions."""
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.detail = detail
        self.status_code = status_code


async def alaga_exception_handler(request: Request, exc: AlagaException):
    """Handles custom AlagaExceptions and returns a consistent JSON format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
