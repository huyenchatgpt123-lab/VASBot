from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"
    cancelled = "cancelled"


UNASSIGNED_DEPARTMENT = "Chưa gán"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    assignee_name = Column(String(255), nullable=False)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    deadline = Column(DateTime(timezone=True), nullable=True)
    has_scheduled_time = Column(Boolean, default=False, nullable=False, server_default="false")
    status = Column(Enum(TaskStatus), default=TaskStatus.pending, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    department = Column(String(255), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assignee = relationship("User", backref="tasks", foreign_keys=[assignee_id])
    document = relationship("Document", backref="tasks", foreign_keys=[document_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
