"""SMTP email for in-app notifications (Outlook / Microsoft 365).

Disabled unless MAIL_ENABLED=true and credentials are set.
Failures are logged only — never raised to callers.
"""
from __future__ import annotations

import logging
import smtplib
import threading
from email.message import EmailMessage
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def is_mail_configured() -> bool:
    if not settings.MAIL_ENABLED:
        return False
    if not (settings.MAIL_HOST or "").strip():
        return False
    if not (settings.MAIL_USERNAME or "").strip():
        return False
    if not (settings.MAIL_PASSWORD or "").strip():
        return False
    if not settings.mail_from_address:
        return False
    return True


def _build_message(
    *,
    to_email: str,
    subject: str,
    body: Optional[str],
    link: str = "/",
) -> EmailMessage:
    msg = EmailMessage()
    from_addr = settings.mail_from_address
    from_name = (settings.MAIL_FROM_NAME or "VATask").strip()
    msg["From"] = f"{from_name} <{from_addr}>" if from_name else from_addr
    msg["To"] = to_email
    msg["Subject"] = subject or "Thông báo VATask"

    lines = []
    if body:
        lines.append(body.strip())
    base = settings.frontend_base_url
    path = link if (link or "").startswith("/") else f"/{link or ''}"
    if base:
        lines.append("")
        lines.append(f"Mở trên VATask: {base}{path}")
    elif path and path != "/":
        lines.append("")
        lines.append(f"Đường dẫn: {path}")
    lines.append("")
    lines.append("---")
    lines.append("Email tự động từ VATask. Vui lòng không trả lời thư này.")

    msg.set_content("\n".join(lines))
    return msg


def send_notification_email(
    *,
    to_email: str,
    subject: str,
    body: Optional[str] = None,
    link: str = "/",
) -> bool:
    """Send one notification email synchronously. Returns True on success."""
    to_email = (to_email or "").strip()
    if not to_email or not is_mail_configured():
        return False

    try:
        msg = _build_message(
            to_email=to_email,
            subject=subject,
            body=body,
            link=link or "/",
        )
        with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
            smtp.send_message(msg)
        logger.info("Notification email sent to %s (%s)", to_email, subject)
        return True
    except Exception:
        logger.exception("Failed to send notification email to %s", to_email)
        return False


def send_notification_email_async(
    *,
    to_email: str,
    subject: str,
    body: Optional[str] = None,
    link: str = "/",
) -> None:
    """Fire-and-forget send so API latency is not tied to SMTP."""
    if not is_mail_configured():
        return
    to_email = (to_email or "").strip()
    if not to_email:
        return

    thread = threading.Thread(
        target=send_notification_email,
        kwargs={
            "to_email": to_email,
            "subject": subject,
            "body": body,
            "link": link or "/",
        },
        daemon=True,
        name="vatask-mail",
    )
    thread.start()
