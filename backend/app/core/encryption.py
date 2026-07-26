import base64
import hashlib
from cryptography.fernet import Fernet
from app.config import settings

def _get_fernet() -> Fernet:
    """
    Derives a valid Fernet key from the application's ENCRYPTION_KEY setting.
    Fernet requires a url-safe base64-encoded 32-byte key.
    We hash the ENCRYPTION_KEY to 32 bytes and then base64 encode it.
    """
    key = settings.ENCRYPTION_KEY.encode('utf-8')
    # Hash the key to get exactly 32 bytes
    hashed_key = hashlib.sha256(key).digest()
    # Base64 encode for Fernet
    b64_key = base64.urlsafe_b64encode(hashed_key)
    return Fernet(b64_key)

def encrypt_token(token: str) -> str:
    """Encrypts a plaintext token for secure storage."""
    if not token:
        return token
    f = _get_fernet()
    return f.encrypt(token.encode('utf-8')).decode('utf-8')

def decrypt_token(encrypted_token: str) -> str:
    """Decrypts a stored encrypted token."""
    if not encrypted_token:
        return encrypted_token
    f = _get_fernet()
    return f.decrypt(encrypted_token.encode('utf-8')).decode('utf-8')
