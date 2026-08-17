from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserRole
from app.models.task import Task
from app.models.document import Document
from app.models.feedback import Feedback
from app.models.conversation import Conversation, Message
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription
from app.models.timetable import TimetableSlot, SubstituteAssignment
from app.models.position import Position
from app.repositories.position_repository import PositionRepository
from app.repositories.department_repository import DepartmentRepository
from app.schemas.auth import UserCreate


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[User]:
        return (
            self.db.query(User)
            .options(
                joinedload(User.position_obj),
                joinedload(User.department_obj),
                joinedload(User.campus),
            )
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

    def get_by_teacher_code(self, code: str, exclude_id: Optional[int] = None) -> Optional[User]:
        if not code or not code.strip():
            return None
        normalized = code.strip().upper()
        query = self.db.query(User).filter(User.teacher_code == normalized)
        if exclude_id is not None:
            query = query.filter(User.id != exclude_id)
        return query.first()

    def get_all(self) -> List[User]:
        return (
            self.db.query(User)
            .options(
                joinedload(User.position_obj),
                joinedload(User.department_obj),
                joinedload(User.campus),
            )
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

    def _resolve_department(self, user_data: UserCreate):
        dept_repo = DepartmentRepository(self.db)
        if getattr(user_data, "department_id", None):
            return dept_repo.get_by_id(user_data.department_id)
        if user_data.department:
            return dept_repo.resolve_by_name(user_data.department)
        return None

    def _resolve_position(self, user_data: UserCreate):
        pos_repo = PositionRepository(self.db)
        if user_data.position_id:
            return pos_repo.get_by_id(user_data.position_id)
        if user_data.position:
            return pos_repo.resolve_by_name(user_data.position)
        return pos_repo.get_default()

    def _resolve_position_list(self, user_data: UserCreate) -> List:
        pos_repo = PositionRepository(self.db)
        ids = list(getattr(user_data, "position_ids", None) or [])
        if not ids and user_data.position_id:
            ids = [user_data.position_id]
        positions = []
        seen = set()
        for pid in ids:
            if pid in seen:
                continue
            pos = pos_repo.get_by_id(pid)
            if pos:
                positions.append(pos)
                seen.add(pid)
        if positions:
            return positions
        if user_data.position:
            resolved = pos_repo.resolve_by_name(user_data.position)
            if resolved:
                return [resolved]
        default = pos_repo.get_default()
        return [default] if default else []

    def set_positions(self, user: User, positions: List) -> None:
        """Replace M2M positions; keep position_id/position as primary (first)."""
        user.positions = list(positions or [])
        if positions:
            primary = positions[0]
            user.position_id = primary.id
            user.position = primary.name
        else:
            user.position_id = None
            user.position = None

    def create(self, user_data: UserCreate, password_hash: str) -> User:
        positions = self._resolve_position_list(user_data)
        department = self._resolve_department(user_data)
        primary = positions[0] if positions else None
        user = User(
            name=user_data.name,
            nickname=user_data.nickname.strip() if user_data.nickname else None,
            email=user_data.email,
            password_hash=password_hash,
            role=UserRole(user_data.role),
            department=department.name if department else user_data.department,
            department_id=department.id if department else None,
            position=primary.name if primary else user_data.position,
            position_id=primary.id if primary else None,
            teacher_code=(user_data.teacher_code or "").strip().upper() or None,
            campus_id=user_data.campus_id,
            must_change_password=True,
        )
        self.db.add(user)
        self.db.flush()
        if positions:
            user.positions = positions
        self.db.commit()
        return self.get_by_id(user.id) or user

    def update(self, user_id: int, **kwargs) -> Optional[User]:
        user = self.get_by_id(user_id)
        if not user:
            return None
        nullable_fields = frozenset({
            "nickname", "teacher_code", "campus_id",
            "department", "department_id", "position", "position_id",
        })
        for key, value in kwargs.items():
            if not hasattr(user, key):
                continue
            if value is None and key not in nullable_fields:
                continue
            if key == "role":
                setattr(user, key, UserRole(value))
            else:
                setattr(user, key, value)
        self.db.commit()
        return self.get_by_id(user_id)

    def count(self) -> int:
        return self.db.query(User).count()

    def delete(self, user_id: int, reassign_documents_to: Optional[int] = None) -> bool:
        """Remove user and related rows (option A: clean timetable / substitutes / notifs)."""
        user = self.get_by_id(user_id)
        if not user:
            return False

        # Documents must keep an uploader — reassign to acting admin when possible
        doc_count = self.db.query(Document).filter(Document.uploaded_by == user_id).count()
        if doc_count > 0:
            if not reassign_documents_to or reassign_documents_to == user_id:
                raise ValueError(
                    "Không thể xóa: còn tài liệu do người này tải lên. "
                    "Đăng nhập bằng admin khác rồi thử lại."
                )
            self.db.query(Document).filter(Document.uploaded_by == user_id).update(
                {Document.uploaded_by: reassign_documents_to},
                synchronize_session=False,
            )

        # Tasks: detach assignee / creator, keep task rows
        self.db.query(Task).filter(Task.assignee_id == user_id).update(
            {Task.assignee_id: None},
            synchronize_session=False,
        )
        self.db.query(Task).filter(Task.created_by_id == user_id).update(
            {Task.created_by_id: None},
            synchronize_session=False,
        )

        self.db.query(Feedback).filter(Feedback.user_id == user_id).delete(
            synchronize_session=False,
        )

        conv_ids = [
            c.id
            for c in self.db.query(Conversation).filter(Conversation.user_id == user_id).all()
        ]
        if conv_ids:
            self.db.query(Message).filter(Message.conversation_id.in_(conv_ids)).delete(
                synchronize_session=False,
            )
            self.db.query(Conversation).filter(Conversation.id.in_(conv_ids)).delete(
                synchronize_session=False,
            )

        self.db.query(Notification).filter(Notification.user_id == user_id).delete(
            synchronize_session=False,
        )
        self.db.query(PushSubscription).filter(PushSubscription.user_id == user_id).delete(
            synchronize_session=False,
        )

        # Substitutes: remove rows where user is absent or covering teacher;
        # clear optional actor refs
        self.db.query(SubstituteAssignment).filter(
            (SubstituteAssignment.absent_teacher_id == user_id)
            | (SubstituteAssignment.substitute_teacher_id == user_id)
        ).delete(synchronize_session=False)
        self.db.query(SubstituteAssignment).filter(
            SubstituteAssignment.assigned_by_id == user_id
        ).update({SubstituteAssignment.assigned_by_id: None}, synchronize_session=False)
        self.db.query(SubstituteAssignment).filter(
            SubstituteAssignment.confirmed_by_id == user_id
        ).update({SubstituteAssignment.confirmed_by_id: None}, synchronize_session=False)

        # Weekly timetable slots for this teacher
        self.db.query(TimetableSlot).filter(TimetableSlot.teacher_id == user_id).delete(
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
