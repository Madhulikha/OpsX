import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import settings
from app.core.security import create_invite_token
from app.models.contractor import Contractor
from app.models.user import User


logger = logging.getLogger(__name__)


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
        "token_type": "contractor_user_invite",
    })
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


def send_enduser_otp(user: User, otp: str) -> bool:
    if not user.email or not settings.SMTP_HOST:
        if user.email:
            logger.warning("SMTP is not configured. OTP for %s was generated but not sent.", user.email)
        return False

    subject = "Your ServTrack sign-in OTP"
    body = (
        f"Hello {user.full_name},\n\n"
        f"Your ServTrack sign-in OTP is {otp}.\n\n"
        "This code expires in 10 minutes. If you did not request it, please ignore this email.\n"
    )

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = user.email
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
        logger.exception("Failed to send OTP to %s", user.email)
        return False

    return True
