from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


# Event kinds
NOTIF_SUBSTITUTE_ASSIGNED = "substitute_assigned"
NOTIF_SUBSTITUTE_CANCELLED = "substitute_cancelled"
NOTIF_SUBSTITUTE_REASSIGNED = "substitute_reassigned"
NOTIF_SUBSTITUTE_REMOVED = "substitute_removed"
NOTIF_SUBSTITUTE_REJECTED = "substitute_rejected"
NOTIF_SUBSTITUTE_COVERED = "substitute_covered"  # người nghỉ: đã xếp người dạy thay
NOTIF_SUBSTITUTE_DEPT = "substitute_dept"  # tổ trưởng: lịch dạy thay liên quan tổ
NOTIF_TASK_ASSIGNED = "task_assigned"


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_read_created", "user_id", "is_read", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String(300), nullable=False, default="/")
    ref_type = Column(String(50), nullable=True)  # substitute | task
    ref_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", backref="notifications")
