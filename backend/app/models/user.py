from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


user_positions = Table(
    "user_positions",
    Base.metadata,
    Column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "position_id",
        Integer,
        ForeignKey("positions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    nickname = Column(String(100), unique=True, nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    department = Column(String(255), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    # Primary/display position (also first of positions list)
    position = Column(String(255), nullable=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)
    teacher_code = Column(String(50), unique=True, nullable=True, index=True)
    campus_id = Column(Integer, ForeignKey("campuses.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    must_change_password = Column(Boolean, default=True, nullable=False, server_default="true")

    position_obj = relationship("Position", foreign_keys=[position_id])
    positions = relationship(
        "Position",
        secondary=user_positions,
        lazy="selectin",
    )
    department_obj = relationship("Department", foreign_keys=[department_id])
    campus = relationship("Campus", foreign_keys=[campus_id])
