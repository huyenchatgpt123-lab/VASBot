from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user_id: int,
        type: str,
        title: str,
        body: Optional[str] = None,
        link: str = "/",
        ref_type: Optional[str] = None,
        ref_id: Optional[int] = None,
    ) -> Notification:
        item = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            link=link,
            ref_type=ref_type,
            ref_id=ref_id,
            is_read=False,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def list_for_user(self, user_id: int, limit: int = 20) -> List[Notification]:
        return (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .all()
        )

    def count_unread(self, user_id: int) -> int:
        return int(
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == user_id, Notification.is_read.is_(False))
            .scalar()
            or 0
        )

    def get_for_user(self, notification_id: int, user_id: int) -> Optional[Notification]:
        return (
            self.db.query(Notification)
            .filter(Notification.id == notification_id, Notification.user_id == user_id)
            .first()
        )

    def mark_read(self, notification_id: int, user_id: int) -> Optional[Notification]:
        item = self.get_for_user(notification_id, user_id)
        if not item:
            return None
        item.is_read = True
        self.db.commit()
        self.db.refresh(item)
        return item

    def mark_all_read(self, user_id: int) -> int:
        count = (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.is_read.is_(False))
            .update({Notification.is_read: True}, synchronize_session=False)
        )
        self.db.commit()
        return int(count or 0)
