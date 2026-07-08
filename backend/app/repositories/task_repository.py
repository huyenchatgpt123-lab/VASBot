from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from datetime import datetime

from app.models.task import Task, TaskStatus


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
        return self.db.query(Task).filter(Task.id == task_id).first()

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
        tasks = query.offset(offset).limit(page_size).all()

        return tasks, total

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
        tasks = query.offset(offset).limit(page_size).all()

        return tasks, total

    def get_all_assignee_names(self) -> List[str]:
        results = self.db.query(Task.assignee_name).distinct().all()
        return [r[0] for r in results if r[0]]

    def get_unassigned(self) -> List[Task]:
        return self.db.query(Task).filter(Task.assignee_id.is_(None)).all()
