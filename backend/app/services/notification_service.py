from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.notification import (
    Notification,
    NOTIF_SUBSTITUTE_ASSIGNED,
    NOTIF_SUBSTITUTE_CANCELLED,
    NOTIF_SUBSTITUTE_REASSIGNED,
    NOTIF_SUBSTITUTE_REMOVED,
    NOTIF_SUBSTITUTE_REJECTED,
    NOTIF_TASK_ASSIGNED,
)
from app.models.timetable import period_label
from app.repositories.notification_repository import NotificationRepository


class NotificationService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = NotificationRepository(db)

    def _format(self, item: Notification) -> dict:
        return {
            "id": item.id,
            "type": item.type,
            "title": item.title,
            "body": item.body,
            "link": item.link or "/",
            "ref_type": item.ref_type,
            "ref_id": item.ref_id,
            "is_read": bool(item.is_read),
            "created_at": item.created_at,
        }

    def list_mine(self, user_id: int, limit: int = 20) -> dict:
        items = self.repo.list_for_user(user_id, limit=limit)
        return {
            "items": [self._format(i) for i in items],
            "unread_count": self.repo.count_unread(user_id),
        }

    def unread_count(self, user_id: int) -> int:
        return self.repo.count_unread(user_id)

    def mark_read(self, notification_id: int, user_id: int) -> dict:
        item = self.repo.mark_read(notification_id, user_id)
        if not item:
            raise ValueError("Không tìm thấy thông báo")
        return self._format(item)

    def mark_all_read(self, user_id: int) -> int:
        return self.repo.mark_all_read(user_id)

    def notify(
        self,
        *,
        user_id: Optional[int],
        type: str,
        title: str,
        body: Optional[str] = None,
        link: str = "/",
        ref_type: Optional[str] = None,
        ref_id: Optional[int] = None,
    ) -> Optional[Notification]:
        """Flush only — caller commits the surrounding transaction."""
        if not user_id:
            return None
        return self.repo.create(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            link=link,
            ref_type=ref_type,
            ref_id=ref_id,
        )

    # ---- domain helpers ----

    def notify_substitute_assigned(self, assignment) -> None:
        if not assignment or not assignment.substitute_teacher_id:
            return
        if assignment.date and hasattr(assignment.date, "isoformat"):
            # skip notify for past dates (business rule)
            from datetime import date as date_cls
            if assignment.date < date_cls.today():
                return
        class_name = assignment.class_room.name if assignment.class_room else "—"
        pl = period_label(assignment.period)
        self.notify(
            user_id=assignment.substitute_teacher_id,
            type=NOTIF_SUBSTITUTE_ASSIGNED,
            title="Lịch dạy thay mới",
            body=f"{assignment.date} · {pl} · lớp {class_name} — vui lòng xác nhận trên Thời khóa biểu.",
            link="/timetable",
            ref_type="substitute",
            ref_id=assignment.id,
        )

    def notify_substitute_cancelled(self, assignment, reason: str = "") -> None:
        if not assignment or not assignment.substitute_teacher_id:
            return
        class_name = assignment.class_room.name if assignment.class_room else "—"
        pl = period_label(assignment.period)
        note = f" Lý do: {reason}" if reason else ""
        self.notify(
            user_id=assignment.substitute_teacher_id,
            type=NOTIF_SUBSTITUTE_CANCELLED,
            title="Lịch dạy thay đã bị hủy",
            body=f"{assignment.date} · {pl} · lớp {class_name}.{note}",
            link="/timetable",
            ref_type="substitute",
            ref_id=assignment.id,
        )

    def notify_substitute_reassigned(
        self,
        assignment,
        *,
        previous_teacher_id: Optional[int],
        notify_users: bool = True,
    ) -> None:
        if not notify_users or not assignment:
            return
        class_name = assignment.class_room.name if assignment.class_room else "—"
        pl = period_label(assignment.period)
        if previous_teacher_id and previous_teacher_id != assignment.substitute_teacher_id:
            self.notify(
                user_id=previous_teacher_id,
                type=NOTIF_SUBSTITUTE_REMOVED,
                title="Lịch dạy thay đã được chuyển",
                body=f"{assignment.date} · {pl} · lớp {class_name} — BGH đã xếp người khác.",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
        if assignment.substitute_teacher_id:
            self.notify(
                user_id=assignment.substitute_teacher_id,
                type=NOTIF_SUBSTITUTE_REASSIGNED,
                title="Bạn được xếp dạy thay",
                body=f"{assignment.date} · {pl} · lớp {class_name} — vui lòng xác nhận trên Thời khóa biểu.",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )

    def notify_substitute_rejected(self, assignment, reason: str = "") -> None:
        if not assignment or not assignment.assigned_by_id:
            return
        class_name = assignment.class_room.name if assignment.class_room else "—"
        pl = period_label(assignment.period)
        sub_name = (
            assignment.substitute_teacher.name
            if assignment.substitute_teacher
            else "GV dạy thay"
        )
        note = f" Lý do: {reason}" if reason else ""
        self.notify(
            user_id=assignment.assigned_by_id,
            type=NOTIF_SUBSTITUTE_REJECTED,
            title="Dạy thay bị từ chối",
            body=f"{sub_name} từ chối {assignment.date} · {pl} · lớp {class_name}.{note}",
            link="/substitutes",
            ref_type="substitute",
            ref_id=assignment.id,
        )

    def notify_task_assigned(self, task) -> None:
        if not task or not getattr(task, "assignee_id", None):
            return
        title = (task.title or "Công việc mới").strip()
        deadline = ""
        if getattr(task, "deadline", None):
            try:
                deadline = f" — hạn {task.deadline.strftime('%d/%m/%Y')}"
            except Exception:
                deadline = ""
        self.notify(
            user_id=task.assignee_id,
            type=NOTIF_TASK_ASSIGNED,
            title="Công việc mới được giao",
            body=f"{title}{deadline}",
            link="/tasks",
            ref_type="task",
            ref_id=task.id,
        )

    def notify_tasks_assigned(self, tasks: List) -> None:
        for task in tasks or []:
            self.notify_task_assigned(task)
