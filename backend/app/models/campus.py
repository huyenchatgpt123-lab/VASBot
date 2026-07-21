from sqlalchemy import Column, Integer, String, Table, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base

document_campuses = Table(
    "document_campuses",
    Base.metadata,
    Column("document_id", Integer, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("campus_id", Integer, ForeignKey("campuses.id", ondelete="CASCADE"), primary_key=True),
)

DEFAULT_CAMPUSES = ["VA1", "VA3", "EMC"]


class Campus(Base):
    __tablename__ = "campuses"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)

    documents = relationship("Document", secondary=document_campuses, back_populates="campuses")
