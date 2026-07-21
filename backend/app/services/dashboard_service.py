from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models.user import User
from app.models.document import Document
from app.models.usage import OpenAIUsage
from app.services.storage_service import get_cloudinary_document_stats


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_dashboard(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> dict:
        start_dt, end_dt = self._parse_dates(start_date, end_date)
        cost_usd = self._get_cost(start_dt, end_dt)
        cost_vnd = round(cost_usd * settings.USD_TO_VND, 0)

        cloudinary_stats = None
        raw_cloudinary = get_cloudinary_document_stats()
        if raw_cloudinary is not None:
            cloudinary_stats = {
                "storage_bytes": raw_cloudinary["storage_bytes"],
                "file_count": raw_cloudinary["file_count"],
            }

        stats = {
            "total_documents": self._count_documents(start_dt, end_dt),
            "total_pages": self._total_pages(start_dt, end_dt),
            "total_users": self.db.query(User).count(),
            "openai_cost_usd": cost_usd,
            "openai_cost_vnd": cost_vnd,
            "cloudinary": cloudinary_stats,
        }
        activity = self._get_activity(start_dt, end_dt)
        return {"stats": stats, "activity": activity}

    def _parse_dates(self, start_date: Optional[str], end_date: Optional[str]):
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                start_dt = datetime.utcnow() - timedelta(days=30)
        else:
            start_dt = datetime.utcnow() - timedelta(days=30)

        if end_date:
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            except ValueError:
                end_dt = datetime.utcnow()
        else:
            end_dt = datetime.utcnow()

        return start_dt, end_dt

    def _count_documents(self, start_dt: datetime, end_dt: datetime) -> int:
        return (
            self.db.query(Document)
            .filter(Document.created_at >= start_dt, Document.created_at <= end_dt)
            .count()
        )

    def _total_pages(self, start_dt: datetime, end_dt: datetime) -> int:
        result = (
            self.db.query(func.sum(Document.page_count))
            .filter(Document.created_at >= start_dt, Document.created_at <= end_dt)
            .scalar()
        )
        return int(result or 0)

    def _get_cost(self, start_dt: datetime, end_dt: datetime) -> float:
        result = (
            self.db.query(func.sum(OpenAIUsage.cost_usd))
            .filter(OpenAIUsage.created_at >= start_dt, OpenAIUsage.created_at <= end_dt)
            .scalar()
        )
        return round(float(result or 0.0), 6)

    def _get_activity(self, start_dt: datetime, end_dt: datetime) -> list:
        doc_activity = (
            self.db.query(
                func.date(Document.created_at).label("date"),
                func.count(Document.id).label("documents"),
            )
            .filter(Document.created_at >= start_dt, Document.created_at <= end_dt)
            .group_by(func.date(Document.created_at))
            .all()
        )

        return [
            {"date": str(row.date), "documents": row.documents}
            for row in sorted(doc_activity, key=lambda r: r.date)
        ]
