"""Singleton row tracking long-running admin jobs (import TKB / users)."""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class SystemBusyState(Base):
    __tablename__ = "system_busy_state"

    id = Column(Integer, primary_key=True)
    busy = Column(Boolean, nullable=False, default=False, server_default="false")
    job = Column(String(50), nullable=True)
    message = Column(String(300), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    started_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
