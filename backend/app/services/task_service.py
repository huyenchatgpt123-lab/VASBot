import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus
from app.models.user import User
from app.models.document import Document
from app.repositories.task_repository import TaskRepository
from app.services.task_extractor import task_extractor

logger = logging.getLogger(__name__)


class TaskService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TaskRepository(db)

    def _match_user(self, name: str) -> Optional[int]:
        """Match assignee name to user: exact → ilike → contains → partial last-name."""
        if not name:
            return None
        user = self.db.query(User).filter(User.name == name).first()
        if user:
            return user.id
        user = self.db.query(User).filter(User.name.ilike(name)).first()
        if user:
            return user.id
        user = self.db.query(User).filter(User.name.ilike(f"%{name}%")).first()
        if user:
            return user.id
        all_users = self.db.query(User).all()
        for u in all_users:
            if u.name and u.name.lower() in name.lower():
                return u.id
        name_parts = name.strip().split()
        if len(name_parts) >= 2:
            short_name = name_parts[-1].lower()
            matches = [u for u in all_users if u.name and u.name.strip().split()[-1].lower() == short_name]
            if len(matches) == 1:
                return matches[0].id
        return None

    def extract_tasks_from_document(self, document_id: int) -> Dict[str, Any]:
        """Extract tasks from document using GPT and return preview."""
        doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError("Tài liệu không tồn tại")

        from app.services.faiss_service import faiss_service
        chunks = [
            c for c in faiss_service._chunks
            if c.get("document_id") == document_id
        ]

        if not chunks:
            return {
                "tasks": [],
                "document_id": document_id,
                "document_name": doc.filename,
                "has_duplicates": False,
                "duplicate_count": 0,
            }

        raw_tasks = task_extractor.extract_from_chunks(chunks)

        existing_count = self.repo.count_by_document(document_id)
        has_duplicates = existing_count > 0

        tasks_preview = []
        for t in raw_tasks:
            assignee_id = self._match_user(t["assignee_name"])
            deadline = None
            if t.get("deadline"):
                try:
                    deadline = datetime.strptime(t["deadline"], "%Y-%m-%d")
                except (ValueError, TypeError):
                    pass

            tasks_preview.append({
                "title": t["title"],
                "assignee_name": t["assignee_name"],
                "assignee_id": assignee_id,
                "deadline": deadline.isoformat() if deadline else None,
                "status": "pending",
                "document_id": document_id,
            })

        return {
            "tasks": tasks_preview,
            "document_id": document_id,
            "document_name": doc.filename,
            "has_duplicates": has_duplicates,
            "duplicate_count": existing_count,
        }

    def save_extracted_tasks(
        self, document_id: int, tasks_data: List[Dict], replace: bool = False
    ) -> List[Task]:
        """Save extracted tasks to DB. If replace=True, delete existing tasks from same document."""
        if replace:
            self.repo.delete_by_document(document_id)

        tasks_to_create = []
        for t in tasks_data:
            deadline = None
            if t.get("deadline"):
                try:
                    if isinstance(t["deadline"], str):
                        deadline = datetime.fromisoformat(t["deadline"].replace("Z", "+00:00"))
                    else:
                        deadline = t["deadline"]
                except (ValueError, TypeError):
                    pass

            assignee_id = t.get("assignee_id")
            if not assignee_id:
                assignee_id = self._match_user(t["assignee_name"])

            tasks_to_create.append({
                "title": t["title"],
                "assignee_name": t["assignee_name"],
                "assignee_id": assignee_id,
                "deadline": deadline,
                "status": TaskStatus.pending,
                "document_id": document_id,
                "note": t.get("note"),
            })

        return self.repo.create_many(tasks_to_create)

    def get_tasks_for_user(
        self, user_id: int, page: int = 1, page_size: int = 20,
        status: Optional[str] = None, sort_by: str = "deadline", order: str = "asc"
    ) -> Tuple[List[Dict], int]:
        tasks, total = self.repo.get_by_user(
            user_id, page, page_size, status, sort_by, order
        )
        return self._format_tasks(tasks), total

    def get_all_tasks(
        self, page: int = 1, page_size: int = 20,
        status: Optional[str] = None, assignee_name: Optional[str] = None,
        sort_by: str = "deadline", order: str = "asc"
    ) -> Tuple[List[Dict], int]:
        tasks, total = self.repo.get_paginated(
            page, page_size, status=status,
            assignee_name=assignee_name, sort_by=sort_by, order=order
        )
        return self._format_tasks(tasks), total

    def update_status(self, task_id: int, status: str, user_id: int, is_admin: bool) -> Optional[Task]:
        task = self.repo.get_by_id(task_id)
        if not task:
            return None
        if not is_admin and task.assignee_id != user_id:
            raise PermissionError("Bạn không có quyền cập nhật công việc này")
        return self.repo.update(task_id, status=TaskStatus(status))

    def update_task(self, task_id: int, **kwargs) -> Optional[Task]:
        if "status" in kwargs and kwargs["status"]:
            kwargs["status"] = TaskStatus(kwargs["status"])
        if "deadline" in kwargs and isinstance(kwargs["deadline"], str):
            try:
                kwargs["deadline"] = datetime.fromisoformat(kwargs["deadline"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                kwargs.pop("deadline", None)
        if "assignee_name" in kwargs and kwargs["assignee_name"]:
            kwargs["assignee_id"] = self._match_user(kwargs["assignee_name"])
        return self.repo.update(task_id, **kwargs)

    def delete_task(self, task_id: int) -> bool:
        return self.repo.delete(task_id)

    def get_assignee_names(self) -> List[str]:
        return self.repo.get_all_assignee_names()

    def _format_tasks(self, tasks: List[Task]) -> List[Dict]:
        result = []
        for task in tasks:
            doc_name = None
            if task.document:
                doc_name = task.document.filename
            result.append({
                "id": task.id,
                "title": task.title,
                "assignee_name": task.assignee_name,
                "assignee_id": task.assignee_id,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "status": task.status.value if task.status else "pending",
                "document_id": task.document_id,
                "document_name": doc_name,
                "note": task.note,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "updated_at": task.updated_at.isoformat() if task.updated_at else None,
            })
        return result
