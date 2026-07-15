from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserRole
from app.models.task import Task
from app.models.document import Document
from app.models.feedback import Feedback
from app.models.conversation import Conversation, Message
from app.repositories.position_repository import PositionRepository
from app.schemas.auth import UserCreate


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[User]:
        return (
            self.db.query(User)
            .options(joinedload(User.position_obj))
            .filter(User.id == user_id)
            .first()
        )

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_nickname(self, nickname: str) -> Optional[User]:
        if not nickname:
            return None
        normalized = nickname.strip().lower()
        return (
            self.db.query(User)
            .filter(User.nickname.isnot(None))
            .filter(func.lower(User.nickname) == normalized)
            .first()
        )

    def nickname_exists(self, nickname: str, exclude_id: Optional[int] = None) -> bool:
        if not nickname or not nickname.strip():
            return False
        normalized = nickname.strip().lower()
        query = (
            self.db.query(User)
            .filter(User.nickname.isnot(None))
            .filter(func.lower(User.nickname) == normalized)
        )
        if exclude_id is not None:
            query = query.filter(User.id != exclude_id)
        return query.first() is not None

    def get_all(self) -> List[User]:
        return (
            self.db.query(User)
            .options(joinedload(User.position_obj))
            .order_by(User.created_at.desc())
            .all()
        )

    def get_by_department(self, department: str) -> List[User]:
        return (
            self.db.query(User)
            .options(joinedload(User.position_obj))
            .filter(User.department == department)
            .order_by(User.name)
            .all()
        )

    def _resolve_position(self, user_data: UserCreate):
        pos_repo = PositionRepository(self.db)
        if user_data.position_id:
            return pos_repo.get_by_id(user_data.position_id)
        if user_data.position:
            return pos_repo.resolve_by_name(user_data.position)
        return pos_repo.get_default()

    def create(self, user_data: UserCreate, password_hash: str) -> User:
        position = self._resolve_position(user_data)
        user = User(
            name=user_data.name,
            nickname=user_data.nickname.strip() if user_data.nickname else None,
            email=user_data.email,
            password_hash=password_hash,
            role=UserRole(user_data.role),
            department=user_data.department,
            position=position.name if position else user_data.position,
            position_id=position.id if position else None,
        )
        self.db.add(user)
        self.db.commit()
        return self.get_by_id(user.id) or user

    def update(self, user_id: int, **kwargs) -> Optional[User]:
        user = self.get_by_id(user_id)
        if not user:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(user, key):
                if key == "role":
                    setattr(user, key, UserRole(value))
                else:
                    setattr(user, key, value)
        self.db.commit()
        return self.get_by_id(user_id)

    def count(self) -> int:
        return self.db.query(User).count()

    def delete(self, user_id: int, reassign_documents_to: Optional[int] = None) -> bool:
        user = self.get_by_id(user_id)
        if not user:
            return False

        doc_count = self.db.query(Document).filter(Document.uploaded_by == user_id).count()
        if doc_count > 0 and reassign_documents_to:
            self.db.query(Document).filter(Document.uploaded_by == user_id).update(
                {Document.uploaded_by: reassign_documents_to},
                synchronize_session=False,
            )

        self.db.query(Task).filter(Task.assignee_id == user_id).update(
            {Task.assignee_id: None},
            synchronize_session=False,
        )

        self.db.query(Feedback).filter(Feedback.user_id == user_id).delete(
            synchronize_session=False,
        )

        conv_ids = [
            c.id for c in self.db.query(Conversation).filter(Conversation.user_id == user_id).all()
        ]
        if conv_ids:
            self.db.query(Message).filter(Message.conversation_id.in_(conv_ids)).delete(
                synchronize_session=False,
            )
            self.db.query(Conversation).filter(Conversation.id.in_(conv_ids)).delete(
                synchronize_session=False,
            )

        try:
            self.db.delete(user)
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ValueError(
                "Không thể xóa người dùng vì còn dữ liệu liên quan trong hệ thống."
            )
        return True
