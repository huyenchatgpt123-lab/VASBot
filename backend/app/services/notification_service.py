from __future__ import annotations

import logging
from typing import List, Optional, Set

from sqlalchemy.orm import Session, joinedload

from app.models.notification import (
    Notification,
    NOTIF_SUBSTITUTE_ASSIGNED,
    NOTIF_SUBSTITUTE_CANCELLED,
    NOTIF_SUBSTITUTE_REASSIGNED,
    NOTIF_SUBSTITUTE_REMOVED,
    NOTIF_SUBSTITUTE_REJECTED,
    NOTIF_SUBSTITUTE_COVERED,
    NOTIF_SUBSTITUTE_DEPT,
    NOTIF_TASK_ASSIGNED,
)
from app.models.position import Position
from app.models.timetable import period_label
from app.models.user import User, UserRole
from app.repositories.notification_repository import NotificationRepository
from app.services.email_service import is_mail_configured, send_notification_email_async
from app.services.push_service import is_push_configured, send_push_to_user_async

logger = logging.getLogger(__name__)


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
        """Flush only — caller commits the surrounding transaction.

        Also queues email / web push when configured.
        Channel failures never affect in-app notification creation.
        """
        if not user_id:
            return None
        item = self.repo.create(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            link=link,
            ref_type=ref_type,
            ref_id=ref_id,
        )
        self._queue_notification_email(
            user_id=user_id,
            title=title,
            body=body,
            link=link or "/",
        )
        self._queue_notification_push(
            user_id=user_id,
            title=title,
            body=body,
            link=link or "/",
        )
        return item

    def _queue_notification_email(
        self,
        *,
        user_id: int,
        title: str,
        body: Optional[str],
        link: str,
    ) -> None:
        if not is_mail_configured():
            return
        try:
            user = self.db.query(User).filter(User.id == user_id).first()
            email = (user.email if user else None) or ""
            if not email.strip():
                return
            send_notification_email_async(
                to_email=email.strip(),
                subject=title or "Thông báo VATask",
                body=body,
                link=link or "/",
            )
        except Exception:
            logger.exception(
                "Could not queue notification email for user_id=%s", user_id
            )

    def _queue_notification_push(
        self,
        *,
        user_id: int,
        title: str,
        body: Optional[str],
        link: str,
    ) -> None:
        if not is_push_configured():
            return
        try:
            send_push_to_user_async(
                user_id=user_id,
                title=title or "Thông báo VATask",
                body=body,
                link=link or "/",
            )
        except Exception:
            logger.exception(
                "Could not queue web push for user_id=%s", user_id
            )

    # ---- helpers ----

    @staticmethod
    def _status_label(status: Optional[str]) -> str:
        mapping = {
            "pending": "Chờ xác nhận",
            "confirmed": "Đã xác nhận",
            "rejected": "Từ chối",
            "cancelled": "Đã hủy",
        }
        return mapping.get(status or "", status or "—")

    def _assignment_context(self, assignment) -> dict:
        class_name = assignment.class_room.name if assignment.class_room else "—"
        pl = period_label(assignment.period)
        absent_name = (
            assignment.absent_teacher.name if assignment.absent_teacher else "—"
        )
        sub_name = (
            assignment.substitute_teacher.name
            if assignment.substitute_teacher
            else "—"
        )
        status = getattr(assignment, "status", None) or "pending"
        base = f"{assignment.date} · {pl} · lớp {class_name}"
        return {
            "class_name": class_name,
            "pl": pl,
            "absent_name": absent_name,
            "sub_name": sub_name,
            "status": status,
            "status_label": self._status_label(status),
            "base": base,
        }

    def _team_lead_ids(self, department: Optional[str]) -> List[int]:
        if not department:
            return []
        rows = (
            self.db.query(User)
            .options(joinedload(User.position_obj))
            .join(Position, User.position_id == Position.id)
            .filter(
                User.department == department,
                User.role != UserRole.admin,
                Position.can_manage_tasks.is_(True),
                Position.scope_all_departments.is_(False),
            )
            .all()
        )
        return [u.id for u in rows]

    def _notify_team_leads(
        self,
        assignment,
        *,
        title: str,
        body: str,
        exclude_ids: Optional[Set[int]] = None,
    ) -> None:
        exclude = set(exclude_ids or [])
        depts: Set[str] = set()
        if assignment.absent_teacher and assignment.absent_teacher.department:
            depts.add(assignment.absent_teacher.department)
        if assignment.substitute_teacher and assignment.substitute_teacher.department:
            depts.add(assignment.substitute_teacher.department)
        lead_ids: Set[int] = set()
        for dept in depts:
            lead_ids.update(self._team_lead_ids(dept))
        for uid in lead_ids:
            if uid in exclude:
                continue
            self.notify(
                user_id=uid,
                type=NOTIF_SUBSTITUTE_DEPT,
                title=title,
                body=body,
                link="/substitutes",
                ref_type="substitute",
                ref_id=assignment.id,
            )

    # ---- domain helpers ----

    def notify_substitute_assigned(self, assignment) -> None:
        if not assignment or not assignment.substitute_teacher_id:
            return
        if assignment.date and hasattr(assignment.date, "isoformat"):
            from datetime import date as date_cls
            if assignment.date < date_cls.today():
                return

        ctx = self._assignment_context(assignment)
        exclude: Set[int] = set()

        self.notify(
            user_id=assignment.substitute_teacher_id,
            type=NOTIF_SUBSTITUTE_ASSIGNED,
            title="Lịch dạy thay mới",
            body=(
                f"{ctx['base']} — thay GV {ctx['absent_name']} "
                f"({ctx['status_label']}). Vui lòng xác nhận trên Thời khóa biểu."
            ),
            link="/timetable",
            ref_type="substitute",
            ref_id=assignment.id,
        )
        exclude.add(assignment.substitute_teacher_id)

        if assignment.absent_teacher_id:
            self.notify(
                user_id=assignment.absent_teacher_id,
                type=NOTIF_SUBSTITUTE_COVERED,
                title="Đã xếp người dạy thay cho bạn",
                body=(
                    f"{ctx['base']} — GV {ctx['sub_name']} dạy thay "
                    f"({ctx['status_label']}). Xem trên Thời khóa biểu."
                ),
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.absent_teacher_id)

        self._notify_team_leads(
            assignment,
            title="Tổ có lịch dạy thay mới",
            body=(
                f"{ctx['base']} — GV {ctx['sub_name']} thay GV {ctx['absent_name']} "
                f"({ctx['status_label']})."
            ),
            exclude_ids=exclude,
        )

    def notify_substitute_cancelled(self, assignment, reason: str = "") -> None:
        if not assignment:
            return
        ctx = self._assignment_context(assignment)
        note = f" Lý do: {reason}" if reason else ""
        exclude: Set[int] = set()

        if assignment.substitute_teacher_id:
            self.notify(
                user_id=assignment.substitute_teacher_id,
                type=NOTIF_SUBSTITUTE_CANCELLED,
                title="Lịch dạy thay đã bị hủy",
                body=f"{ctx['base']}.{note}",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.substitute_teacher_id)

        if assignment.absent_teacher_id:
            self.notify(
                user_id=assignment.absent_teacher_id,
                type=NOTIF_SUBSTITUTE_COVERED,
                title="Lịch dạy thay cho bạn đã bị hủy",
                body=f"{ctx['base']} — trước đó GV {ctx['sub_name']} dạy thay.{note}",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.absent_teacher_id)

        self._notify_team_leads(
            assignment,
            title="Lịch dạy thay trong tổ đã hủy",
            body=f"{ctx['base']} — GV {ctx['sub_name']} thay GV {ctx['absent_name']}.{note}",
            exclude_ids=exclude,
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
        ctx = self._assignment_context(assignment)
        exclude: Set[int] = set()

        if previous_teacher_id and previous_teacher_id != assignment.substitute_teacher_id:
            self.notify(
                user_id=previous_teacher_id,
                type=NOTIF_SUBSTITUTE_REMOVED,
                title="Lịch dạy thay đã được chuyển",
                body=f"{ctx['base']} — BGH đã xếp người khác.",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(previous_teacher_id)

        if assignment.substitute_teacher_id:
            self.notify(
                user_id=assignment.substitute_teacher_id,
                type=NOTIF_SUBSTITUTE_REASSIGNED,
                title="Bạn được xếp dạy thay",
                body=(
                    f"{ctx['base']} — thay GV {ctx['absent_name']} "
                    f"({ctx['status_label']}). Vui lòng xác nhận trên Thời khóa biểu."
                ),
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.substitute_teacher_id)

        if assignment.absent_teacher_id:
            self.notify(
                user_id=assignment.absent_teacher_id,
                type=NOTIF_SUBSTITUTE_COVERED,
                title="Đã đổi người dạy thay cho bạn",
                body=(
                    f"{ctx['base']} — GV {ctx['sub_name']} dạy thay "
                    f"({ctx['status_label']}). Xem trên Thời khóa biểu."
                ),
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.absent_teacher_id)

        self._notify_team_leads(
            assignment,
            title="Tổ có đổi người dạy thay",
            body=(
                f"{ctx['base']} — GV {ctx['sub_name']} thay GV {ctx['absent_name']} "
                f"({ctx['status_label']})."
            ),
            exclude_ids=exclude,
        )

    def notify_substitute_rejected(self, assignment, reason: str = "") -> None:
        if not assignment:
            return
        ctx = self._assignment_context(assignment)
        note = f" Lý do: {reason}" if reason else ""
        exclude: Set[int] = set()

        if assignment.assigned_by_id:
            self.notify(
                user_id=assignment.assigned_by_id,
                type=NOTIF_SUBSTITUTE_REJECTED,
                title="Dạy thay bị từ chối",
                body=f"{ctx['sub_name']} từ chối {ctx['base']}.{note}",
                link="/substitutes",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.assigned_by_id)

        if assignment.absent_teacher_id:
            self.notify(
                user_id=assignment.absent_teacher_id,
                type=NOTIF_SUBSTITUTE_COVERED,
                title="Người dạy thay từ chối lịch của bạn",
                body=f"GV {ctx['sub_name']} từ chối {ctx['base']}.{note}",
                link="/timetable",
                ref_type="substitute",
                ref_id=assignment.id,
            )
            exclude.add(assignment.absent_teacher_id)

        if assignment.substitute_teacher_id:
            exclude.add(assignment.substitute_teacher_id)

        self._notify_team_leads(
            assignment,
            title="Dạy thay trong tổ bị từ chối",
            body=f"GV {ctx['sub_name']} từ chối {ctx['base']} (thay GV {ctx['absent_name']}).{note}",
            exclude_ids=exclude,
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
