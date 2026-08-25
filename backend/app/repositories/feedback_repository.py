from typing import Optional, List, Tuple
from sqlalchemy.orm import Session, joinedload

from app.models.feedback import Feedback, FeedbackStatus, FeedbackAttachment


class FeedbackRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, content: str) -> Feedback:
        feedback = Feedback(user_id=user_id, content=content, status=FeedbackStatus.new)
        self.db.add(feedback)
        self.db.flush()
        return feedback

    def add_attachment(
        self,
        *,
        feedback_id: int,
        filename: str,
        content_type: Optional[str],
        size_bytes: int,
        storage_path: str,
    ) -> FeedbackAttachment:
        att = FeedbackAttachment(
            feedback_id=feedback_id,
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            storage_path=storage_path,
        )
        self.db.add(att)
        self.db.flush()
        return att

    def get_by_id(self, feedback_id: int) -> Optional[Feedback]:
        return (
            self.db.query(Feedback)
            .options(joinedload(Feedback.attachments), joinedload(Feedback.user))
            .filter(Feedback.id == feedback_id)
            .first()
        )

    def get_attachment(self, attachment_id: int) -> Optional[FeedbackAttachment]:
        return (
            self.db.query(FeedbackAttachment)
            .options(joinedload(FeedbackAttachment.feedback))
            .filter(FeedbackAttachment.id == attachment_id)
            .first()
        )

    def get_by_user(self, user_id: int) -> List[Feedback]:
        return (
            self.db.query(Feedback)
            .options(joinedload(Feedback.attachments), joinedload(Feedback.user))
            .filter(Feedback.user_id == user_id)
            .order_by(Feedback.created_at.desc())
            .all()
        )

    def get_all(self, status: Optional[str] = None) -> Tuple[List[Feedback], int]:
        base = self.db.query(Feedback)
        if status:
            base = base.filter(Feedback.status == status)
        total = base.count()
        feedbacks = (
            base.options(
                joinedload(Feedback.attachments),
                joinedload(Feedback.user),
            )
            .order_by(Feedback.created_at.desc())
            .all()
        )
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

    def commit(self) -> None:
        self.db.commit()
