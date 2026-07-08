from typing import Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models.feedback import Feedback, FeedbackStatus


class FeedbackRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, content: str) -> Feedback:
        feedback = Feedback(user_id=user_id, content=content, status=FeedbackStatus.new)
        self.db.add(feedback)
        self.db.commit()
        self.db.refresh(feedback)
        return feedback

    def get_by_id(self, feedback_id: int) -> Optional[Feedback]:
        return self.db.query(Feedback).filter(Feedback.id == feedback_id).first()

    def get_by_user(self, user_id: int) -> List[Feedback]:
        return (
            self.db.query(Feedback)
            .filter(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
            .all()
        )

    def get_all(self, status: Optional[str] = None) -> Tuple[List[Feedback], int]:
        query = self.db.query(Feedback)
        if status:
            query = query.filter(Feedback.status == status)
        total = query.count()
        feedbacks = query.order_by(Feedback.created_at.desc()).all()
        return feedbacks, total

    def count_new(self) -> int:
        return self.db.query(Feedback).filter(Feedback.status == FeedbackStatus.new).count()

    def mark_read(self, feedback_id: int) -> Optional[Feedback]:
        feedback = self.get_by_id(feedback_id)
        if not feedback:
            return None
        feedback.status = FeedbackStatus.read
        self.db.commit()
        self.db.refresh(feedback)
        return feedback
