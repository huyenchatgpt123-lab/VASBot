"""Web Push (PWA) for in-app notifications.

Disabled unless PUSH_ENABLED=true and VAPID keys are set.
Failures are logged only — never raised to callers.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def is_push_configured() -> bool:
    if not settings.PUSH_ENABLED:
        return False
    if not (settings.VAPID_PUBLIC_KEY or "").strip():
        return False
    if not (settings.VAPID_PRIVATE_KEY or "").strip():
        return False
    return True


def vapid_public_key() -> Optional[str]:
    if not is_push_configured():
        return None
    return settings.VAPID_PUBLIC_KEY.strip()


def send_push_to_user_async(
    *,
    user_id: int,
    title: str,
    body: Optional[str] = None,
    link: str = "/",
) -> None:
    if not is_push_configured() or not user_id:
        return
    thread = threading.Thread(
        target=_send_push_job,
        kwargs={
            "user_id": user_id,
            "title": title or "Thông báo VATask",
            "body": body or "",
            "link": link or "/",
        },
        daemon=True,
        name="vatask-webpush",
    )
    thread.start()


def _send_push_job(
    *,
    user_id: int,
    title: str,
    body: str,
    link: str,
) -> None:
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error("pywebpush is not installed; cannot send web push")
        return

    from app.database import SessionLocal
    from app.models.push_subscription import PushSubscription

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "link": link if link.startswith("/") else f"/{link}",
        },
        ensure_ascii=False,
    )
    vapid_claims = {
        "sub": (settings.VAPID_SUBJECT or "mailto:admin@vietanhschool.edu.vn").strip(),
    }

    db = SessionLocal()
    try:
        subs = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .all()
        )
        if not subs:
            return

        stale_ids = []
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY.strip(),
                    vapid_claims=vapid_claims,
                )
            except WebPushException as exc:
                status_code = None
                if getattr(exc, "response", None) is not None:
                    status_code = getattr(exc.response, "status_code", None)
                if status_code in (404, 410):
                    stale_ids.append(sub.id)
                else:
                    logger.warning(
                        "Web push failed user_id=%s status=%s: %s",
                        user_id,
                        status_code,
                        exc,
                    )
            except Exception:
                logger.exception("Web push error user_id=%s sub_id=%s", user_id, sub.id)

        if stale_ids:
            db.query(PushSubscription).filter(
                PushSubscription.id.in_(stale_ids)
            ).delete(synchronize_session=False)
            db.commit()
            logger.info("Removed %s stale push subscriptions", len(stale_ids))
    except Exception:
        logger.exception("Web push job failed for user_id=%s", user_id)
    finally:
        db.close()
