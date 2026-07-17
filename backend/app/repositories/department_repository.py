import unicodedata
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.department import Department


def _normalize(text: str) -> str:
    if not text:
        return ""
    text = text.strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


class DepartmentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[Department]:
        return self.db.query(Department).order_by(Department.sort_order, Department.name).all()

    def get_names(self) -> List[str]:
        return [d.name for d in self.get_all()]

    def get_by_id(self, department_id: int) -> Optional[Department]:
        return self.db.query(Department).filter(Department.id == department_id).first()

    def get_by_name(self, name: str) -> Optional[Department]:
        if not name:
            return None
        normalized = _normalize(name)
        for dept in self.get_all():
            if _normalize(dept.name) == normalized:
                return dept
        return None

    def resolve_by_name(self, name: Optional[str]) -> Optional[Department]:
        if not name:
            return None
        return self.get_by_name(name)

    def create(self, **kwargs) -> Department:
        dept = Department(**kwargs)
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)
        return dept

    def update(self, department_id: int, **kwargs) -> Optional[Department]:
        dept = self.get_by_id(department_id)
        if not dept:
            return None
        old_name = dept.name
        for key, value in kwargs.items():
            if value is not None and hasattr(dept, key):
                setattr(dept, key, value)
        self.db.commit()
        self.db.refresh(dept)
        if dept.name != old_name:
            self._rename_references(old_name, dept.name, dept.id)
        return dept

    def _rename_references(self, old_name: str, new_name: str, dept_id: int) -> None:
        from app.models.user import User
        from app.models.document import Document
        from app.models.task import Task

        self.db.query(User).filter(
            (User.department == old_name) | (User.department_id == dept_id)
        ).update({User.department: new_name}, synchronize_session=False)
        self.db.query(Document).filter(Document.department == old_name).update(
            {Document.department: new_name}, synchronize_session=False
        )
        self.db.query(Task).filter(Task.department == old_name).update(
            {Task.department: new_name}, synchronize_session=False
        )
        self.db.commit()

    def delete(self, department_id: int) -> bool:
        from app.models.user import User
        from app.models.document import Document
        from app.models.task import Task

        dept = self.get_by_id(department_id)
        if not dept:
            return False
        user_count = self.db.query(User).filter(User.department_id == department_id).count()
        if user_count == 0:
            user_count = self.db.query(User).filter(User.department == dept.name).count()
        doc_count = self.db.query(Document).filter(Document.department == dept.name).count()
        task_count = self.db.query(Task).filter(Task.department == dept.name).count()
        if user_count > 0 or doc_count > 0 or task_count > 0:
            raise ValueError(
                f"Không thể xóa: còn {user_count} người dùng, {doc_count} tài liệu, {task_count} công việc"
            )
        self.db.delete(dept)
        self.db.commit()
        return True

    def count_users(self, department_id: int) -> int:
        from app.models.user import User

        dept = self.get_by_id(department_id)
        if not dept:
            return 0
        by_id = self.db.query(User).filter(User.department_id == department_id).count()
        by_name = self.db.query(User).filter(
            User.department == dept.name, User.department_id.is_(None)
        ).count()
        return by_id + by_name
