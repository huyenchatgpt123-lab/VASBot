from sqlalchemy import Column, Integer, String

from app.database import Base


DEFAULT_DEPARTMENTS = [
    "Tổ Toán",
    "Tổ Xã hội 1",
    "Tổ Xã hội 2",
    "Tổ Tự Nhiên",
    "Tổ Tin học",
    "Tổ Tiếng Anh",
    "Tổ Ngữ Văn",
    "Nhà Trường",
]


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
