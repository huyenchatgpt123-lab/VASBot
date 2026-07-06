from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.sql import func

from app.database import Base


class OpenAIUsage(Base):
    __tablename__ = "openai_usage"

    id = Column(Integer, primary_key=True, index=True)
    model = Column(String(100), nullable=False)
    tokens_used = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    operation = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
