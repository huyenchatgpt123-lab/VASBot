from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.models.usage import OpenAIUsage


class UsageRepository:
    def __init__(self, db: Session):
        self.db = db

    def log_usage(self, model: str, tokens_used: int, cost_usd: float, operation: str):
        usage = OpenAIUsage(
            model=model,
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            operation=operation,
        )
        self.db.add(usage)
        self.db.commit()

    def get_monthly_cost(self) -> float:
        now = datetime.utcnow()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        result = (
            self.db.query(func.sum(OpenAIUsage.cost_usd))
            .filter(OpenAIUsage.created_at >= start_of_month)
            .scalar()
        )
        return float(result or 0.0)
