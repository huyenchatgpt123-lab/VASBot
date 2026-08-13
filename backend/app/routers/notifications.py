from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.repositories.push_subscription_repository import PushSubscriptionRepository
from app.schemas.notification import (
    NotificationItem,
    NotificationListResponse,
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    UnreadCountResponse,
)
from app.services.notification_service import NotificationService
from app.services.push_service import is_push_configured, vapid_public_key
from app.utils.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationService(db).list_mine(current_user.id, limit=limit)


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": NotificationService(db).unread_count(current_user.id)}


@router.get("/push/config")
def push_config(current_user: User = Depends(get_current_user)):
    """Public VAPID key for browser PushManager.subscribe (auth required)."""
    enabled = is_push_configured()
    return {
        "enabled": enabled,
        "public_key": vapid_public_key() if enabled else None,
    }


@router.post("/push/subscribe")
def push_subscribe(
    body: PushSubscribeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_push_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push chưa được bật trên máy chủ",
        )
    endpoint = (body.endpoint or "").strip()
    p256dh = (body.p256dh or "").strip()
    auth = (body.auth or "").strip()
    if not endpoint or not p256dh or not auth:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu thông tin đăng ký push",
        )
    ua = body.user_agent or request.headers.get("user-agent")
    PushSubscriptionRepository(db).upsert(
        user_id=current_user.id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=ua,
    )
    return {"message": "Đã bật thông báo trên thiết bị này"}


@router.post("/push/unsubscribe")
def push_unsubscribe(
    body: PushUnsubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    endpoint = (body.endpoint or "").strip()
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu endpoint",
        )
    ok = PushSubscriptionRepository(db).delete_for_user(current_user.id, endpoint)
    return {"message": "Đã tắt thông báo trên thiết bị này" if ok else "Không tìm thấy đăng ký", "removed": ok}


@router.post("/{notification_id}/read", response_model=NotificationItem)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return NotificationService(db).mark_read(notification_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = NotificationService(db).mark_all_read(current_user.id)
    return {"message": f"Đã đánh dấu {count} thông báo đã đọc", "count": count}
