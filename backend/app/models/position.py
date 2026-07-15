from sqlalchemy import Column, Integer, String, Boolean

from app.database import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    can_upload = Column(Boolean, default=False, nullable=False)
    can_manage_tasks = Column(Boolean, default=False, nullable=False)
    can_delete_documents = Column(Boolean, default=False, nullable=False)
    scope_all_departments = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
