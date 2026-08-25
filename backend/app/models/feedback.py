from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class FeedbackStatus(str, enum.Enum):
    new = "new"
    read = "read"


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(Enum(FeedbackStatus), default=FeedbackStatus.new, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="feedbacks")
    attachments = relationship(
        "FeedbackAttachment",
        back_populates="feedback",
        cascade="all, delete-orphan",
        order_by="FeedbackAttachment.id",
    )


class FeedbackAttachment(Base):
    __tablename__ = "feedback_attachments"

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(Integer, ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    storage_path = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    feedback = relationship("Feedback", back_populates="attachments")
