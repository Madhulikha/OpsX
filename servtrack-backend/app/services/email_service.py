import logging
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import settings
from app.core.pii import decrypt_pii
from app.core.security import create_invite_token
from app.models.contractor import Contractor
from app.models.user import User


logger = logging.getLogger(__name__)


def twilio_verify_configured() -> bool:
    return bool(
        settings.TWILIO_VERIFY_ENABLED
        and settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_VERIFY_SERVICE_SID
    )


def _twilio_verify_request(path: str, payload: dict[str, str]) -> dict:
    import base64
    import json

    if not twilio_verify_configured():
        raise RuntimeError("Twilio Verify is not configured")

    url = f"https://verify.twilio.com/v2/Services/{settings.TWILIO_VERIFY_SERVICE_SID}/{path}"
    body = urllib.parse.urlencode(payload).encode("utf-8")
    credentials = f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Basic {base64.b64encode(credentials).decode('ascii')}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("Twilio Verify request failed: %s", detail)
        raise RuntimeError(detail or "Twilio Verify request failed") from exc


def start_twilio_phone_verification(phone: str) -> tuple[bool, str | None]:
    try:
        _twilio_verify_request("Verifications", {
            "To": phone,
            "Channel": settings.TWILIO_VERIFY_CHANNEL or "sms",
        })
        return True, None
    except Exception as exc:
        logger.warning("Failed to start Twilio verification for %s: %s", phone, exc)
        return False, str(exc)


def check_twilio_phone_verification(phone: str, code: str) -> bool:
    try:
        result = _twilio_verify_request("VerificationCheck", {
            "To": phone,
            "Code": code,
        })
    except Exception:
        logger.exception("Failed to check Twilio verification for %s", phone)
        return False
    return result.get("status") == "approved"


def build_contractor_invite_url(contractor: Contractor) -> str:
    token = create_invite_token({
        "sub": contractor.email,
        "email": contractor.email,
        "contractor_id": contractor.id,
        "contractor_name": contractor.name,
    })
    return f"{settings.FRONTEND_URL.rstrip('/')}/invite?{urlencode({'token': token})}"


def build_contractor_user_invite_url(email: str, contractor: Contractor, role: str) -> str:
    token = create_invite_token({
        "sub": email,
        "email": email,
        "contractor_id": contractor.id,
        "contractor_name": contractor.name,
        "invite_role": role,
    }, token_type="contractor_user_invite")
    return f"{settings.FRONTEND_URL.rstrip('/')}/invite?{urlencode({'token': token})}"


def build_client_invite_url(
    email: str,
    client_id: int,
    client_name: str,
    full_name: str | None = None,
    client_subrole: str = "commandant_engineer",
) -> str:
    token = create_invite_token({
        "sub": email,
        "email": email,
        "client_id": client_id,
        "client_name": client_name,
        "full_name": full_name,
        "client_subrole": client_subrole,
    }, token_type="client_invite")
    return f"{settings.FRONTEND_URL.rstrip('/')}/invite?{urlencode({'token': token})}"


def send_contractor_invite(contractor: Contractor, invited_by: User, invite_url: str | None = None) -> bool:
    if not contractor.email:
        return False

    invite_url = invite_url or build_contractor_invite_url(contractor)
    subject = f"You're invited to join ServTrack for {contractor.name}"
    body = (
        f"Hello {contractor.name},\n\n"
        f"{invited_by.full_name} invited you to join ServTrack as a contractor partner.\n\n"
        f"Create your account here:\n{invite_url}\n\n"
        "This invite link expires in 7 days.\n"
    )

    if not settings.SMTP_HOST:
        logger.warning("SMTP is not configured. Contractor invite for %s: %s", contractor.email, invite_url)
        return False

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = contractor.email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send contractor invite to %s", contractor.email)
        return False

    return True


def send_contractor_user_invite(email: str, contractor: Contractor, role: str, invited_by: User, invite_url: str) -> bool:
    role_label = "supervisor" if role == "supervisor" else "workman"
    subject = f"You're invited to join {contractor.name} on ServTrack"
    body = (
        f"Hello,\n\n"
        f"{invited_by.full_name} invited you to join ServTrack as a {role_label} for {contractor.name}.\n\n"
        f"Create your account here:\n{invite_url}\n\n"
        "This invite link expires in 7 days.\n"
    )

    if not settings.SMTP_HOST:
        logger.warning("SMTP is not configured. %s invite for %s: %s", role_label, email, invite_url)
        return False

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send %s invite to %s", role_label, email)
        return False

    return True


def send_client_invite(
    email: str,
    client_name: str,
    invited_by: User,
    invite_url: str,
    role_label: str = "commandant engineer",
) -> bool:
    subject = f"You're invited to set up {client_name} on ServTrack"
    body = (
        "Hello,\n\n"
        f"{invited_by.full_name} invited you to join ServTrack as the {role_label} for {client_name}.\n\n"
        f"Create your password here:\n{invite_url}\n\n"
        "This invite link expires in 7 days.\n"
    )

    if not settings.SMTP_HOST:
        logger.warning("SMTP is not configured. Client invite for %s: %s", email, invite_url)
        return False

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send client invite to %s", email)
        return False

    return True


def send_enduser_otp(user: User, otp: str) -> bool:
    email = decrypt_pii(user.email)
    full_name = decrypt_pii(user.full_name)

    if not email or not settings.SMTP_HOST:
        if email:
            logger.warning("SMTP is not configured. OTP for %s was generated but not sent.", email)
        return False

    subject = "Your ServTrack sign-in OTP"
    body = (
        f"Hello {full_name},\n\n"
        f"Your ServTrack sign-in OTP is {otp}.\n\n"
        "This code expires in 10 minutes. If you did not request it, please ignore this email.\n"
    )

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send OTP to %s", email)
        return False

    return True
