from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User
from app.models.document import Document
from app.models.conversation import Conversation, Message, MessageRole
from app.models.usage import OpenAIUsage


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_dashboard(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> dict:
        start_dt, end_dt = self._parse_dates(start_date, end_date)

        stats = {
            "total_documents": self._count_documents(start_dt, end_dt),
            "total_pages": self._total_pages(start_dt, end_dt),
            "total_users": self.db.query(User).count(),
            "total_conversations": self._count_conversations(start_dt, end_dt),
            "total_ai_questions": self._count_questions(start_dt, end_dt),
            "openai_cost_this_month": self._get_cost(start_dt, end_dt),
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

    def _count_conversations(self, start_dt: datetime, end_dt: datetime) -> int:
        return (
            self.db.query(Conversation)
            .filter(Conversation.created_at >= start_dt, Conversation.created_at <= end_dt)
            .count()
        )

    def _count_questions(self, start_dt: datetime, end_dt: datetime) -> int:
        return (
            self.db.query(Message)
            .filter(
                Message.role == MessageRole.user,
                Message.created_at >= start_dt,
                Message.created_at <= end_dt,
            )
            .count()
        )

    def _get_cost(self, start_dt: datetime, end_dt: datetime) -> float:
        result = (
            self.db.query(func.sum(OpenAIUsage.cost_usd))
            .filter(OpenAIUsage.created_at >= start_dt, OpenAIUsage.created_at <= end_dt)
            .scalar()
        )
        return float(result or 0.0)

    def _get_activity(self, start_dt: datetime, end_dt: datetime) -> list:
        conv_activity = (
            self.db.query(
                func.date(Conversation.created_at).label("date"),
                func.count(Conversation.id).label("conversations"),
            )
            .filter(Conversation.created_at >= start_dt, Conversation.created_at <= end_dt)
            .group_by(func.date(Conversation.created_at))
            .all()
        )

        msg_activity = (
            self.db.query(
                func.date(Message.created_at).label("date"),
                func.count(Message.id).label("questions"),
            )
            .filter(
                Message.role == MessageRole.user,
                Message.created_at >= start_dt,
                Message.created_at <= end_dt,
            )
            .group_by(func.date(Message.created_at))
            .all()
        )

        activity_map = {}
        for row in conv_activity:
            activity_map[str(row.date)] = {"conversations": row.conversations, "questions": 0}
        for row in msg_activity:
            date_str = str(row.date)
            if date_str in activity_map:
                activity_map[date_str]["questions"] = row.questions
            else:
                activity_map[date_str] = {"conversations": 0, "questions": row.questions}

        return [
            {"date": date, "conversations": data["conversations"], "questions": data["questions"]}
            for date, data in sorted(activity_map.items())
        ]
