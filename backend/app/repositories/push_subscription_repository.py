from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.push_subscription import PushSubscription


class PushSubscriptionRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert(
        self,
        *,
        user_id: int,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: Optional[str] = None,
    ) -> PushSubscription:
        item = (
            self.db.query(PushSubscription)
            .filter(PushSubscription.endpoint == endpoint)
            .first()
        )
        if item:
            item.user_id = user_id
            item.p256dh = p256dh
            item.auth = auth
            if user_agent is not None:
                item.user_agent = user_agent[:300] if user_agent else None
        else:
            item = PushSubscription(
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=(user_agent[:300] if user_agent else None),
            )
            self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_for_user(self, user_id: int, endpoint: str) -> bool:
        item = (
            self.db.query(PushSubscription)
            .filter(
                PushSubscription.user_id == user_id,
                PushSubscription.endpoint == endpoint,
            )
            .first()
        )
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True

    def list_for_user(self, user_id: int) -> List[PushSubscription]:
        return (
            self.db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .all()
        )
