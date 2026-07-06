from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


DEPARTMENTS = [
    "Tổ Toán",
    "Tổ Xã hội 1",
    "Tổ Xã hội 2",
    "Tổ Tự Nhiên",
    "Tổ Tin học",
    "Tổ Tiếng Anh",
    "Tổ Ngữ Văn",
    "Nhà Trường",
]


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(500), nullable=False)
    filepath = Column(String(1000), nullable=False)
    page_count = Column(Integer, default=0)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    department = Column(String(255), nullable=True)
    month = Column(Integer, nullable=True)
    school_year = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    uploader = relationship("User", backref="documents")
