"""Notification emails via Microsoft Graph (HTTPS) or optional SMTP.

Default: Microsoft Graph — works on hosts that block outbound SMTP (e.g. Render free).
Set MAIL_PROVIDER=smtp only if the host allows ports 587/465.

Disabled unless MAIL_ENABLED=true and the active provider is configured.
Failures are logged only — never raised to callers.
"""
from __future__ import annotations

import json
import logging
import smtplib
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_token_lock = threading.Lock()
_cached_token: Optional[str] = None
_cached_token_expires_at: float = 0.0


def is_mail_configured() -> bool:
    if not settings.MAIL_ENABLED:
        return False
    provider = (settings.MAIL_PROVIDER or "graph").strip().lower()
    if provider == "smtp":
        if not (settings.MAIL_HOST or "").strip():
            return False
        if not (settings.MAIL_USERNAME or "").strip():
            return False
        if not (settings.MAIL_PASSWORD or "").strip():
            return False
        return bool(settings.mail_from_address)
    # graph (default)
    if not (settings.GRAPH_TENANT_ID or "").strip():
        return False
    if not (settings.GRAPH_CLIENT_ID or "").strip():
        return False
    if not (settings.GRAPH_CLIENT_SECRET or "").strip():
        return False
    return bool(settings.mail_from_address)


def _notification_body_text(*, body: Optional[str], link: str = "/") -> str:
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
    return "\n".join(lines)


def _get_graph_token() -> str:
    """Client-credentials token for Microsoft Graph (cached until near expiry)."""
    global _cached_token, _cached_token_expires_at

    now = time.time()
    with _token_lock:
        if _cached_token and now < (_cached_token_expires_at - 60):
            return _cached_token

    tenant = settings.GRAPH_TENANT_ID.strip()
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    data = urllib.parse.urlencode(
        {
            "client_id": settings.GRAPH_CLIENT_ID.strip(),
            "client_secret": settings.GRAPH_CLIENT_SECRET.strip(),
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Graph token response missing access_token")

    expires_in = int(payload.get("expires_in") or 3600)
    with _token_lock:
        _cached_token = token
        _cached_token_expires_at = time.time() + expires_in
    return token


def _send_via_graph(
    *,
    to_email: str,
    subject: str,
    body: Optional[str],
    link: str,
) -> None:
    token = _get_graph_token()
    from_addr = settings.mail_from_address
    text = _notification_body_text(body=body, link=link)
    payload = {
        "message": {
            "subject": subject or "Thông báo VATask",
            "body": {
                "contentType": "Text",
                "content": text,
            },
            "toRecipients": [
                {"emailAddress": {"address": to_email}},
            ],
        },
        "saveToSentItems": False,
    }

    user_path = urllib.parse.quote(from_addr)
    url = f"https://graph.microsoft.com/v1.0/users/{user_path}/sendMail"
    raw = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            # sendMail returns 202 Accepted with empty body
            if resp.status not in (202, 200):
                raise RuntimeError(f"Graph sendMail unexpected status {resp.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Graph sendMail HTTP {exc.code}: {detail}") from exc


def _send_via_smtp(
    *,
    to_email: str,
    subject: str,
    body: Optional[str],
    link: str,
) -> None:
    msg = EmailMessage()
    from_addr = settings.mail_from_address
    from_name = (settings.MAIL_FROM_NAME or "VATask").strip()
    msg["From"] = f"{from_name} <{from_addr}>" if from_name else from_addr
    msg["To"] = to_email
    msg["Subject"] = subject or "Thông báo VATask"
    msg.set_content(_notification_body_text(body=body, link=link))

    with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
        smtp.send_message(msg)


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

    provider = (settings.MAIL_PROVIDER or "graph").strip().lower()
    try:
        if provider == "smtp":
            _send_via_smtp(
                to_email=to_email,
                subject=subject,
                body=body,
                link=link or "/",
            )
        else:
            _send_via_graph(
                to_email=to_email,
                subject=subject,
                body=body,
                link=link or "/",
            )
        logger.info(
            "Notification email sent via %s to %s (%s)",
            provider,
            to_email,
            subject,
        )
        return True
    except Exception:
        logger.exception(
            "Failed to send notification email via %s to %s",
            provider,
            to_email,
        )
        return False


def send_notification_email_async(
    *,
    to_email: str,
    subject: str,
    body: Optional[str] = None,
    link: str = "/",
) -> None:
    """Fire-and-forget send so API latency is not tied to mail providers."""
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
