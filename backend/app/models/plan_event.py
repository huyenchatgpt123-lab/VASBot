from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class PlanEvent(Base):
    """Calendar event extracted from or linked to a document (1 document → N events)."""

    __tablename__ = "plan_events"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=True, index=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(20), nullable=False, default="ai")  # ai | manual
    needs_review = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    document = relationship("Document", back_populates="plan_events")
