"""Timetable / substitute-teaching domain models.

Period numbering is global for the day:
  1–5  morning
  6–8  afternoon
Subject is intentionally NOT stored — only department (tổ) + free/busy matters.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

PERIOD_MIN = 1
PERIOD_MAX = 8
MORNING_PERIODS = frozenset({1, 2, 3, 4, 5})
AFTERNOON_PERIODS = frozenset({6, 7, 8})
DAY_MIN = 2  # Monday
DAY_MAX = 7  # Saturday


def session_for_period(period: int) -> str:
    if period in AFTERNOON_PERIODS:
        return "afternoon"
    return "morning"


def period_label(period: int) -> str:
    if period in AFTERNOON_PERIODS:
        return f"Chiều {period - 5}"
    return f"Sáng {period}"


class ClassRoom(Base):
    __tablename__ = "classes"
    __table_args__ = (
        UniqueConstraint("name", "campus_id", name="uq_classes_name_campus"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    grade = Column(Integer, nullable=True)
    campus_id = Column(Integer, ForeignKey("campuses.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    campus = relationship("Campus")
    slots = relationship("TimetableSlot", back_populates="class_room")


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"
    __table_args__ = (
        UniqueConstraint(
            "teacher_id", "day_of_week", "period",
            name="uq_tt_teacher_day_period",
        ),
        UniqueConstraint(
            "class_id", "day_of_week", "period",
            name="uq_tt_class_day_period",
        ),
        Index("ix_tt_campus_day_period", "campus_id", "day_of_week", "period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    campus_id = Column(Integer, ForeignKey("campuses.id"), nullable=False, index=True)
    day_of_week = Column(SmallInteger, nullable=False)  # 2..7
    period = Column(SmallInteger, nullable=False)  # 1..8
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("User", foreign_keys=[teacher_id])
    class_room = relationship("ClassRoom", back_populates="slots")
    campus = relationship("Campus")


class SubstituteAssignment(Base):
    """Concrete substitute lesson on a calendar date (not a weekly template)."""

    __tablename__ = "substitute_assignments"
    __table_args__ = (
        Index("ix_sub_teacher_date", "substitute_teacher_id", "date"),
        Index("ix_sub_date_period", "date", "period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    absent_teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    substitute_teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    campus_id = Column(Integer, ForeignKey("campuses.id"), nullable=False)
    date = Column(Date, nullable=False)
    period = Column(SmallInteger, nullable=False)  # 1..8
    status = Column(String(20), nullable=False, default="assigned")  # assigned|cancelled
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    absent_teacher = relationship("User", foreign_keys=[absent_teacher_id])
    substitute_teacher = relationship("User", foreign_keys=[substitute_teacher_id])
    class_room = relationship("ClassRoom")
    campus = relationship("Campus")
