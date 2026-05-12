import base64
import hashlib
import hmac
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


ENCRYPTION_PREFIX = "enc:v1:"


def _key_bytes() -> bytes:
    raw = settings.PII_ENCRYPTION_KEY
    if raw:
        try:
            decoded = base64.urlsafe_b64decode(raw)
        except Exception:
            decoded = base64.b64decode(raw)
        if len(decoded) != 32:
            raise ValueError("PII_ENCRYPTION_KEY must decode to 32 bytes")
        return decoded

    if settings.APP_ENV != "development":
        raise ValueError("PII_ENCRYPTION_KEY is required outside development")

    return hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()


def is_encrypted(value: Optional[str]) -> bool:
    return bool(value and value.startswith(ENCRYPTION_PREFIX))


def encrypt_pii(value: Optional[str]) -> Optional[str]:
    if value is None or value == "" or is_encrypted(value):
        return value
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key_bytes()).encrypt(nonce, value.encode("utf-8"), None)
    return f"{ENCRYPTION_PREFIX}{base64.urlsafe_b64encode(nonce + ciphertext).decode('ascii')}"


def decrypt_pii(value: Optional[str]) -> Optional[str]:
    if value is None or value == "" or not is_encrypted(value):
        return value
    payload = base64.urlsafe_b64decode(value[len(ENCRYPTION_PREFIX):])
    nonce, ciphertext = payload[:12], payload[12:]
    return AESGCM(_key_bytes()).decrypt(nonce, ciphertext, None).decode("utf-8")


def normalize_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.strip().lower()


def normalize_phone(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = "".join(ch for ch in value.strip() if ch.isdigit() or ch == "+")
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if cleaned.startswith("+"):
        return f"+{digits}" if digits else None
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return cleaned or None


def lookup_hash(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return hmac.new(_key_bytes(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def email_lookup_hash(value: Optional[str]) -> Optional[str]:
    return lookup_hash(normalize_email(value))


def phone_lookup_hash(value: Optional[str]) -> Optional[str]:
    return lookup_hash(normalize_phone(value))
