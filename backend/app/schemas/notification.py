from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    link: str
    ref_type: Optional[str] = None
    ref_id: Optional[int] = None
    is_read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int
