from typing import Optional, List, Tuple
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, asc, or_, and_
from datetime import datetime

from app.models.task import Task, TaskStatus, UNASSIGNED_DEPARTMENT
from app.models.document import Document
from app.models.user import User as UserModel


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, **kwargs) -> Task:
        task = Task(**kwargs)
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def create_many(self, tasks_data: List[dict]) -> List[Task]:
        tasks = []
        for data in tasks_data:
            task = Task(**data)
            self.db.add(task)
            tasks.append(task)
        self.db.commit()
        for t in tasks:
            self.db.refresh(t)
        return tasks

    def get_by_id(self, task_id: int) -> Optional[Task]:
        return (
            self.db.query(Task)
            .options(
                joinedload(Task.document),
                joinedload(Task.assignee),
            )
            .filter(Task.id == task_id)
            .first()
        )

    def update(self, task_id: int, **kwargs) -> Optional[Task]:
        task = self.get_by_id(task_id)
        if not task:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(task, key, value)
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete(self, task_id: int) -> bool:
        task = self.get_by_id(task_id)
        if not task:
            return False
        self.db.delete(task)
        self.db.commit()
        return True

    def delete_by_document(self, document_id: int) -> int:
        count = self.db.query(Task).filter(Task.document_id == document_id).delete()
        self.db.commit()
        return count

    def delete_manual(self) -> int:
        count = self.db.query(Task).filter(Task.document_id.is_(None)).delete()
        self.db.commit()
        return count

    def count_by_document(self, document_id: int) -> int:
        return self.db.query(Task).filter(Task.document_id == document_id).count()

    def get_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        assignee_id: Optional[int] = None,
        assignee_name: Optional[str] = None,
        document_id: Optional[int] = None,
        department: Optional[str] = None,
        deadline_from: Optional[datetime] = None,
        deadline_to: Optional[datetime] = None,
        sort_by: str = "deadline",
        order: str = "asc",
    ) -> Tuple[List[Task], int]:
        query = self.db.query(Task)

        if status:
            query = query.filter(Task.status == status)
        if assignee_id:
            query = query.filter(Task.assignee_id == assignee_id)
        if assignee_name:
            query = query.filter(Task.assignee_name.ilike(f"%{assignee_name}%"))
        if document_id is not None:
            query = query.filter(Task.document_id == document_id)
        if department:
            query = query.filter(Task.department == department)
        if deadline_from:
            query = query.filter(Task.deadline >= deadline_from)
        if deadline_to:
            query = query.filter(Task.deadline <= deadline_to)

        total = query.count()

        sort_column = getattr(Task, sort_by, Task.deadline)
        if order == "desc":
            query = query.order_by(desc(sort_column).nulls_last())
        else:
            query = query.order_by(asc(sort_column).nulls_last())

        offset = (page - 1) * page_size
        tasks = (
            query.options(joinedload(Task.document), joinedload(Task.assignee))
            .offset(offset)
            .limit(page_size)
            .all()
        )

        return tasks, total

    def _department_scope_filter(
        self, query, department: str, manager_user_id: Optional[int] = None
    ):
        conditions = [
            Task.department == department,
            and_(
                Task.department == UNASSIGNED_DEPARTMENT,
                Document.department == department,
            ),
        ]
        if manager_user_id is not None:
            conditions.append(Task.created_by_id == manager_user_id)
        return query.outerjoin(Document, Task.document_id == Document.id).filter(or_(*conditions))

    def get_by_department_scope(
        self,
        department: str,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        assignee_name: Optional[str] = None,
        document_id: Optional[int] = None,
        task_department: Optional[str] = None,
        sort_by: str = "deadline",
        order: str = "asc",
        manager_user_id: Optional[int] = None,
    ) -> Tuple[List[Task], int]:
        query = self.db.query(Task)
        query = self._department_scope_filter(query, department, manager_user_id)

        if status:
            query = query.filter(Task.status == status)
        if assignee_name:
            query = query.filter(Task.assignee_name.ilike(f"%{assignee_name}%"))
        if document_id is not None:
            query = query.filter(Task.document_id == document_id)
        if task_department:
            query = query.filter(Task.department == task_department)

        total = query.count()

        sort_column = getattr(Task, sort_by, Task.deadline)
        if order == "desc":
            query = query.order_by(desc(sort_column).nulls_last())
        else:
            query = query.order_by(asc(sort_column).nulls_last())

        offset = (page - 1) * page_size
        tasks = (
            query.options(joinedload(Task.document), joinedload(Task.assignee))
            .offset(offset)
            .limit(page_size)
            .all()
        )
        return tasks, total

    def delete_manual_by_department(self, department: str) -> int:
        count = self.db.query(Task).filter(
            Task.document_id.is_(None),
            Task.department == department,
        ).delete(synchronize_session=False)
        self.db.commit()
        return count

    def get_by_user(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        sort_by: str = "deadline",
        order: str = "asc",
    ) -> Tuple[List[Task], int]:
        query = self.db.query(Task).filter(Task.assignee_id == user_id)

        if status:
            query = query.filter(Task.status == status)

        total = query.count()

        sort_column = getattr(Task, sort_by, Task.deadline)
        if order == "desc":
            query = query.order_by(desc(sort_column).nulls_last())
        else:
            query = query.order_by(asc(sort_column).nulls_last())

        offset = (page - 1) * page_size
        tasks = (
            query.options(joinedload(Task.document), joinedload(Task.assignee))
            .offset(offset)
            .limit(page_size)
            .all()
        )

        return tasks, total

    def get_all_assignee_names(self) -> List[str]:
        results = self.db.query(Task.assignee_name).distinct().all()
        return sorted([r[0] for r in results if r[0]], key=lambda s: s.lower())

    def _apply_manager_scope(
        self,
        query,
        *,
        department: Optional[str] = None,
        manager_user_id: Optional[int] = None,
    ):
        if department:
            return self._department_scope_filter(query, department, manager_user_id)
        return query

    def get_scoped_assignee_names(
        self,
        *,
        department: Optional[str] = None,
        manager_user_id: Optional[int] = None,
    ) -> List[str]:
        query = self.db.query(Task.assignee_name)
        query = self._apply_manager_scope(
            query, department=department, manager_user_id=manager_user_id
        )
        results = query.distinct().all()
        return sorted([r[0] for r in results if r[0]], key=lambda s: s.lower())

    def get_scoped_departments(
        self,
        *,
        department: Optional[str] = None,
        manager_user_id: Optional[int] = None,
    ) -> List[str]:
        query = self.db.query(Task.department)
        query = self._apply_manager_scope(
            query, department=department, manager_user_id=manager_user_id
        )
        results = query.distinct().all()
        depts = [r[0] for r in results if r[0]]
        return sorted(depts, key=lambda s: (s == UNASSIGNED_DEPARTMENT, s.lower()))

    def get_scoped_plans(
        self,
        *,
        department: Optional[str] = None,
        manager_user_id: Optional[int] = None,
    ) -> List[dict]:
        """Distinct documents that have tasks in scope."""
        query = (
            self.db.query(Document.id, Document.plan_title, Document.filename)
            .select_from(Task)
            .join(Document, Task.document_id == Document.id)
        )
        if department:
            conditions = [
                Task.department == department,
                and_(
                    Task.department == UNASSIGNED_DEPARTMENT,
                    Document.department == department,
                ),
            ]
            if manager_user_id is not None:
                conditions.append(Task.created_by_id == manager_user_id)
            query = query.filter(or_(*conditions))

        plans: List[dict] = []
        seen_ids = set()
        for doc_id, plan_title, filename in query.distinct().all():
            if doc_id in seen_ids:
                continue
            seen_ids.add(doc_id)
            name = (plan_title or "").strip() or (filename or f"Tài liệu #{doc_id}")
            plans.append({"document_id": doc_id, "name": name})
        plans.sort(key=lambda p: p["name"].lower())
        return plans

    def get_unassigned(self) -> List[Task]:
        return self.db.query(Task).filter(Task.assignee_id.is_(None)).all()
