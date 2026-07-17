import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus, UNASSIGNED_DEPARTMENT
from app.models.user import User
from app.models.document import Document
from app.repositories.task_repository import TaskRepository
from app.services.task_extractor import task_extractor
from app.utils.permissions import (
    is_admin,
    can_manage_task,
    can_manage_tasks,
    has_scope_all_departments,
)

logger = logging.getLogger(__name__)


class TaskService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TaskRepository(db)

    def _match_user(self, name: str) -> Optional[int]:
        from app.utils.name_matcher import match_user_by_name
        return match_user_by_name(self.db, name)

    def _resolve_task_department(self, assignee_id: Optional[int]) -> str:
        if assignee_id:
            assignee = self.db.query(User).filter(User.id == assignee_id).first()
            if assignee and assignee.department:
                return assignee.department
        return UNASSIGNED_DEPARTMENT

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
                "department": self._resolve_task_department(assignee_id),
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

    def get_tasks_for_department(
        self, department: str, page: int = 1, page_size: int = 20,
        status: Optional[str] = None, assignee_name: Optional[str] = None,
        sort_by: str = "deadline", order: str = "asc",
        manager_user_id: Optional[int] = None,
    ) -> Tuple[List[Dict], int]:
        tasks, total = self.repo.get_by_department_scope(
            department, page, page_size, status=status,
            assignee_name=assignee_name, sort_by=sort_by, order=order,
            manager_user_id=manager_user_id,
        )
        return self._format_tasks(tasks), total

    def get_tasks_for_manager(
        self, user: User, page: int = 1, page_size: int = 20,
        status: Optional[str] = None, assignee_name: Optional[str] = None,
        sort_by: str = "deadline", order: str = "asc",
    ) -> Tuple[List[Dict], int]:
        if is_admin(user) or has_scope_all_departments(user):
            return self.get_all_tasks(
                page, page_size, status=status,
                assignee_name=assignee_name, sort_by=sort_by, order=order,
            )
        if not user.department:
            return [], 0
        return self.get_tasks_for_department(
            user.department, page, page_size, status=status,
            assignee_name=assignee_name, sort_by=sort_by, order=order,
            manager_user_id=user.id,
        )

    def update_status(self, task_id: int, status: str, user: User) -> Optional[Task]:
        task = self.repo.get_by_id(task_id)
        if not task:
            return None
        if not is_admin(user) and not can_manage_task(user, task) and task.assignee_id != user.id:
            raise PermissionError("Bạn không có quyền cập nhật công việc này")
        return self.repo.update(task_id, status=TaskStatus(status))

    def update_task(self, task_id: int, user: User, **kwargs) -> Optional[Task]:
        task = self.repo.get_by_id(task_id)
        if not task:
            return None
        if not is_admin(user) and not can_manage_task(user, task):
            raise PermissionError("Bạn không có quyền chỉnh sửa công việc này")
        if "status" in kwargs and kwargs["status"]:
            kwargs["status"] = TaskStatus(kwargs["status"])
        if "deadline" in kwargs and isinstance(kwargs["deadline"], str):
            try:
                kwargs["deadline"] = datetime.fromisoformat(kwargs["deadline"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                kwargs.pop("deadline", None)
        if "assignee_id" in kwargs and kwargs["assignee_id"]:
            pass
        elif "assignee_name" in kwargs and kwargs["assignee_name"]:
            kwargs["assignee_id"] = self._match_user(kwargs["assignee_name"])
        if "assignee_id" in kwargs:
            kwargs["department"] = self._resolve_task_department(kwargs.get("assignee_id"))
        return self.repo.update(task_id, **kwargs)

    def delete_task(self, task_id: int, user: User) -> bool:
        task = self.repo.get_by_id(task_id)
        if not task:
            return False
        if not is_admin(user) and not can_manage_task(user, task):
            raise PermissionError("Bạn không có quyền xóa công việc này")
        return self.repo.delete(task_id)

    def delete_tasks_by_document(self, document_id: Optional[int], user: User) -> int:
        if document_id is not None:
            doc = self.db.query(Document).filter(Document.id == document_id).first()
            if not doc:
                raise PermissionError("Tài liệu không tồn tại")
            if not is_admin(user):
                if not can_manage_tasks(user):
                    raise PermissionError("Bạn không có quyền xóa công việc của kế hoạch này")
                if not has_scope_all_departments(user) and doc.department != user.department:
                    raise PermissionError("Bạn không có quyền xóa công việc của kế hoạch này")
            return self.repo.delete_by_document(document_id)
        if is_admin(user) or has_scope_all_departments(user):
            return self.repo.delete_manual()
        if not user.department:
            return 0
        return self.repo.delete_manual_by_department(user.department)

    def create_tasks_batch(self, user: User, title: str, assignee_ids: List[int], **kwargs) -> List[Task]:
        if not is_admin(user) and not can_manage_tasks(user):
            raise PermissionError("Bạn không có quyền tạo công việc")
        if not assignee_ids:
            raise PermissionError("Phải chọn ít nhất một người được giao")

        doc_id = kwargs.get("document_id")
        if not is_admin(user) and not has_scope_all_departments(user) and doc_id:
            doc = self.db.query(Document).filter(Document.id == doc_id).first()
            if not doc or doc.department != user.department:
                raise PermissionError("Chỉ được tạo công việc trong kế hoạch của tổ mình")

        created = []
        for assignee_id in assignee_ids:
            assignee = self.db.query(User).filter(User.id == assignee_id).first()
            if not assignee:
                raise PermissionError(f"Người dùng ID {assignee_id} không tồn tại")
            task_data = {
                "title": title,
                "assignee_id": assignee.id,
                "assignee_name": assignee.name,
                "deadline": kwargs.get("deadline"),
                "document_id": doc_id,
                "note": kwargs.get("note"),
                "status": TaskStatus.pending,
                "department": self._resolve_task_department(assignee.id),
                "created_by_id": user.id,
            }
            created.append(self.repo.create(**task_data))
        return created

    def sync_task_group(
        self, user: User, task_ids: List[int], title: str, assignee_ids: List[int], **kwargs
    ) -> List[Task]:
        if not task_ids:
            raise PermissionError("Không có công việc để cập nhật")
        if not assignee_ids:
            raise PermissionError("Phải chọn ít nhất một người được giao")

        existing_tasks = [self.repo.get_by_id(tid) for tid in task_ids]
        existing_tasks = [t for t in existing_tasks if t]
        if not existing_tasks:
            raise PermissionError("Công việc không tồn tại")

        for task in existing_tasks:
            if not is_admin(user) and not can_manage_task(user, task):
                raise PermissionError("Bạn không có quyền chỉnh sửa công việc này")

        doc_id = kwargs.get("document_id", existing_tasks[0].document_id)
        deadline = kwargs.get("deadline")
        note = kwargs.get("note")

        current_ids = {t.assignee_id for t in existing_tasks if t.assignee_id}
        new_ids = set(assignee_ids)
        to_remove = current_ids - new_ids
        to_add = new_ids - current_ids

        update_fields = {"title": title, "document_id": doc_id, "note": note}
        if deadline is not None:
            update_fields["deadline"] = deadline

        for task in existing_tasks:
            if task.assignee_id in to_remove:
                self.repo.delete(task.id)
            elif task.assignee_id in new_ids:
                self.repo.update(
                    task.id,
                    **update_fields,
                    department=self._resolve_task_department(task.assignee_id),
                )

        for assignee_id in to_add:
            assignee = self.db.query(User).filter(User.id == assignee_id).first()
            if not assignee:
                raise PermissionError(f"Người dùng ID {assignee_id} không tồn tại")
            self.repo.create(
                title=title,
                assignee_id=assignee.id,
                assignee_name=assignee.name,
                deadline=deadline,
                document_id=doc_id,
                note=note,
                status=TaskStatus.pending,
                department=self._resolve_task_department(assignee.id),
                created_by_id=user.id,
            )

        return existing_tasks

    def create_task(self, user: User, task_data: dict) -> Task:
        if not is_admin(user) and not can_manage_tasks(user):
            raise PermissionError("Bạn không có quyền tạo công việc")
        assignee_id = task_data.get("assignee_id")
        if not assignee_id:
            assignee_id = self._match_user(task_data["assignee_name"])
            task_data["assignee_id"] = assignee_id
        task_data["department"] = self._resolve_task_department(assignee_id)
        task_data["created_by_id"] = user.id
        if not is_admin(user) and not has_scope_all_departments(user):
            doc_id = task_data.get("document_id")
            if doc_id:
                doc = self.db.query(Document).filter(Document.id == doc_id).first()
                if not doc or doc.department != user.department:
                    raise PermissionError("Chỉ được tạo công việc trong kế hoạch của tổ mình")
        return self.repo.create(**task_data)

    def get_assignee_names(self) -> List[str]:
        return self.repo.get_all_assignee_names()

    def rematch_assignees(self, user_id: Optional[int] = None) -> Dict[str, int]:
        tasks = self.repo.get_unassigned()
        matched = 0
        for task in tasks:
            uid = self._match_user(task.assignee_name)
            if uid and (user_id is None or uid == user_id):
                self.repo.update(
                    task.id,
                    assignee_id=uid,
                    department=self._resolve_task_department(uid),
                )
                matched += 1
        return {"matched": matched, "total_unassigned": len(tasks)}

    def _format_tasks(self, tasks: List[Task]) -> List[Dict]:
        result = []
        for task in tasks:
            doc_name = None
            document_department = None
            if task.document:
                doc_name = task.document.filename
                document_department = task.document.department
            department = task.department or UNASSIGNED_DEPARTMENT
            result.append({
                "id": task.id,
                "title": task.title,
                "assignee_name": task.assignee_name,
                "assignee_id": task.assignee_id,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "status": task.status.value if task.status else "pending",
                "document_id": task.document_id,
                "document_name": doc_name,
                "document_department": document_department,
                "department": department,
                "created_by_id": task.created_by_id,
                "note": task.note,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "updated_at": task.updated_at.isoformat() if task.updated_at else None,
            })
        return result
