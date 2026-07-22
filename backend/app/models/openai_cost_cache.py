from sqlalchemy import Column, Integer, String, DateTime, Float, Date, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class OpenAICostDaily(Base):
    __tablename__ = "openai_cost_daily"
    __table_args__ = (
        UniqueConstraint("cost_date", "line_item", name="uq_openai_cost_daily_date_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    cost_date = Column(Date, nullable=False, index=True)
    line_item = Column(String(255), nullable=False)
    cost_usd = Column(Float, nullable=False, default=0.0)


class OpenAICostSync(Base):
    __tablename__ = "openai_cost_sync"

    id = Column(Integer, primary_key=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_status = Column(String(20), nullable=True)
    last_sync_error = Column(String(500), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
