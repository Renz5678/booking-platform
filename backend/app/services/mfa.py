"""RFC 6238 SHA-1 TOTP with replay counters and hashed recovery codes."""
import base64
import hashlib
import hmac
import secrets
import struct
import time


def new_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000:06d}"


def verify_totp(secret: str, code: str, last_counter: int, now=None):
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return None
    current = int(time.time() if now is None else now) // 30
    for counter in (current, current - 1, current + 1):
        if counter >= 0 and counter > last_counter and hmac.compare_digest(totp(secret, counter), code):
            return counter
    return None


def recovery_hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode()).hexdigest()


def recovery_codes():
    codes = [secrets.token_hex(10) for _ in range(10)]
    return codes, [recovery_hash(code) for code in codes]
