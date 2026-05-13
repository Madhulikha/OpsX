import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from app.core.config import settings
from app.core.pii import normalize_phone


logger = logging.getLogger(__name__)


def valid_e164_phone(phone: str | None) -> bool:
    if not phone:
        return False
    digits = "".join(ch for ch in phone if ch.isdigit())
    return phone.startswith("+") and 10 <= len(digits) <= 15


@dataclass
class SmsSendResult:
    sent: bool
    provider: str | None = None
    status_code: int | None = None
    message: str | None = None
    provider_id: str | None = None


def sms_configured() -> bool:
    provider = (settings.SMS_PROVIDER or "").strip().lower()
    if provider != "exotel":
        return False
    return all([
        settings.exotel_account_sid,
        settings.EXOTEL_API_KEY,
        settings.EXOTEL_API_TOKEN,
        settings.EXOTEL_SENDER_ID,
    ])


def _exotel_endpoint() -> str:
    subdomain = settings.EXOTEL_SUBDOMAIN.strip().removeprefix("https://").removeprefix("http://").rstrip("/")
    return f"https://{subdomain}/v1/Accounts/{settings.exotel_account_sid}/Sms/send.json"


def _extract_exotel_sid(body: str) -> str | None:
    try:
        payload = json.loads(body)
    except Exception:
        return None

    sms = payload.get("SMSMessage") if isinstance(payload, dict) else None
    if isinstance(sms, dict):
        return sms.get("Sid") or sms.get("SmsSid")
    return None


def send_exotel_sms(phone: str, message: str) -> SmsSendResult:
    to_phone = normalize_phone(phone)
    if not valid_e164_phone(to_phone):
        return SmsSendResult(False, provider="exotel", message="Invalid phone number")
    if not sms_configured():
        return SmsSendResult(False, provider="exotel", message="Exotel SMS is not configured")
    if not message or not message.strip():
        return SmsSendResult(False, provider="exotel", message="SMS message cannot be empty")
    if len(message) > 2000:
        return SmsSendResult(False, provider="exotel", message="SMS message is too long")

    form = {
        "From": settings.EXOTEL_SENDER_ID,
        "To": to_phone,
        "Body": message.strip(),
        "SmsType": settings.EXOTEL_SMS_TYPE or "transactional",
        "Priority": "high",
        "CustomField": "servtrack-enduser-login",
    }
    if settings.EXOTEL_DLT_ENTITY_ID:
        form["DltEntityId"] = settings.EXOTEL_DLT_ENTITY_ID
    if settings.EXOTEL_DLT_TEMPLATE_ID:
        form["DltTemplateId"] = settings.EXOTEL_DLT_TEMPLATE_ID

    body = urllib.parse.urlencode(form).encode("utf-8")
    auth = f"{settings.EXOTEL_API_KEY}:{settings.EXOTEL_API_TOKEN}".encode("utf-8")
    request = urllib.request.Request(
        _exotel_endpoint(),
        data=body,
        method="POST",
        headers={
            "Authorization": f"Basic {base64.b64encode(auth).decode('ascii')}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            provider_id = _extract_exotel_sid(response_body)
            return SmsSendResult(
                sent=200 <= response.status < 300,
                provider="exotel",
                status_code=response.status,
                message=response.reason,
                provider_id=provider_id,
            )
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        logger.warning("Exotel SMS failed with HTTP %s: %s", exc.code, response_body[:500])
        return SmsSendResult(False, provider="exotel", status_code=exc.code, message=response_body[:500])
    except Exception as exc:
        logger.exception("Exotel SMS request failed")
        return SmsSendResult(False, provider="exotel", message=str(exc))


def send_sms(phone: str, message: str) -> SmsSendResult:
    provider = (settings.SMS_PROVIDER or "").strip().lower()
    if provider == "exotel":
        return send_exotel_sms(phone, message)
    return SmsSendResult(False, provider=provider or None, message="SMS provider is not configured")


def send_otp_sms(phone: str, otp: str) -> SmsSendResult:
    clean_otp = "".join(ch for ch in str(otp) if ch.isdigit())
    if len(clean_otp) != 6:
        return SmsSendResult(False, provider="exotel", message="OTP must be 6 digits")
    message = f"Your ServTrack OTP is {clean_otp}. It expires in 10 minutes. Do not share it with anyone."
    return send_sms(phone, message)
