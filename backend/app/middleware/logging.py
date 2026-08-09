import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for audit logging sensitive requests.
    Logs method, path, and client IP.
    Note: Full user identification requires JWT decoding which is usually done at the route level.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Define paths that require audit logging
        sensitive_paths = ["/admin", "/bookings", "/counselors/me", "/payments"]
        
        is_sensitive = any(request.url.path.startswith(path) for path in sensitive_paths)

        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            if is_sensitive:
                process_time = time.time() - start_time
                client_ip = request.client.host if request.client else "unknown"
                logger.info(
                    "AUDIT: %s %s - Client IP: %s - Status: %d - Process Time: %.3fs",
                    request.method,
                    request.url.path,
                    client_ip,
                    response.status_code,
                    process_time,
                )
            
            return response
            
        except Exception as e:
            if is_sensitive:
                process_time = time.time() - start_time
                client_ip = request.client.host if request.client else "unknown"
                logger.error(
                    "AUDIT ERROR: %s %s - Client IP: %s - Process Time: %.3fs - Error: %s",
                    request.method,
                    request.url.path,
                    client_ip,
                    process_time,
                    str(e),
                )
            raise
