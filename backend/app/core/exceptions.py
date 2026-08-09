from fastapi import Request, status
from fastapi.responses import JSONResponse


class AlagaException(Exception):
    """Base exception for all custom Alaga exceptions."""
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.detail = detail
        self.status_code = status_code


class BookingNotFound(AlagaException):
    def __init__(self, booking_id: str):
        super().__init__(
            detail=f"Booking not found: {booking_id}",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class UnauthorizedBookingAccess(AlagaException):
    def __init__(self):
        super().__init__(
            detail="Not authorized to access this booking",
            status_code=status.HTTP_403_FORBIDDEN,
        )


class PaymentFailed(AlagaException):
    def __init__(self, reason: str = "Payment processing failed"):
        super().__init__(
            detail=reason,
            status_code=status.HTTP_400_BAD_REQUEST,
        )


async def alaga_exception_handler(request: Request, exc: AlagaException):
    """Handles custom AlagaExceptions and returns a consistent JSON format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
