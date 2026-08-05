from typing import Optional

from app.models.user import User, UserRole
from app.models.task import Task
from app.models.document import Document

_PERM_KEYS = (
    "can_upload",
    "can_manage_tasks",
    "can_delete_documents",
    "scope_all_departments",
    "can_access_substitutes",
    "can_manage_calendar",
    "can_import_timetable",
    "bgh_workspace",
)


def is_admin(user: User) -> bool:
    return user.role == UserRole.admin


def _position(user: User):
    return getattr(user, "position_obj", None)


def get_permissions(user: User) -> dict:
    if is_admin(user):
        # Admin has all operational rights; BGH workspace is a non-admin UI profile.
        return {key: (False if key == "bgh_workspace" else True) for key in _PERM_KEYS}
    pos = _position(user)
    if not pos:
        return {key: False for key in _PERM_KEYS}
    return {
        "can_upload": bool(pos.can_upload),
        "can_manage_tasks": bool(pos.can_manage_tasks),
        "can_delete_documents": bool(pos.can_delete_documents),
        "scope_all_departments": bool(pos.scope_all_departments),
        "can_access_substitutes": bool(getattr(pos, "can_access_substitutes", False)),
        "can_manage_calendar": bool(getattr(pos, "can_manage_calendar", False)),
        "can_import_timetable": bool(getattr(pos, "can_import_timetable", False)),
        "bgh_workspace": bool(getattr(pos, "bgh_workspace", False)),
    }


def can_upload(user: User) -> bool:
    return get_permissions(user)["can_upload"]


def can_manage_tasks(user: User) -> bool:
    return get_permissions(user)["can_manage_tasks"]


def can_delete_documents(user: User) -> bool:
    return get_permissions(user)["can_delete_documents"]


def has_scope_all_departments(user: User) -> bool:
    return get_permissions(user)["scope_all_departments"]


def can_access_substitutes(user: User) -> bool:
    return get_permissions(user)["can_access_substitutes"]


def can_manage_calendar(user: User) -> bool:
    return get_permissions(user)["can_manage_calendar"]


def can_import_timetable(user: User) -> bool:
    return get_permissions(user)["can_import_timetable"]


def has_bgh_workspace(user: User) -> bool:
    """BGH UI profile: hide TKB + Công việc, home = Lịch hoạt động."""
    if is_admin(user):
        return False
    return get_permissions(user)["bgh_workspace"]


def can_access_department(user: User, department: Optional[str]) -> bool:
    if is_admin(user) or has_scope_all_departments(user):
        return True
    if not user.department or not department:
        return False
    return user.department == department


def can_manage_task(user: User, task: Task) -> bool:
    if is_admin(user):
        return True
    if not can_manage_tasks(user):
        return False
    if has_scope_all_departments(user):
        return True
    if not user.department:
        return False
    if task.department == user.department:
        return True
    if task.document_id and task.document and task.document.department == user.department:
        return True
    if task.created_by_id == user.id:
        return True
    return False


def can_delete_document(user: User, doc: Document) -> bool:
    if is_admin(user):
        return True
    if not can_delete_documents(user):
        return False
    if has_scope_all_departments(user):
        return True
    if not user.department:
        return False
    return doc.department == user.department


def can_re_extract_document(user: User, doc: Document) -> bool:
    """Admin / scope-all with upload|tasks: any doc. Lead: own department only."""
    if is_admin(user):
        return True
    perms = get_permissions(user)
    if not (perms["can_upload"] or perms["can_manage_tasks"]):
        return False
    if perms["scope_all_departments"]:
        return True
    if not user.department:
        return False
    return doc.department == user.department


def can_upload_to_department(user: User, department: str) -> bool:
    if not can_upload(user):
        return False
    if is_admin(user) or has_scope_all_departments(user):
        return True
    return bool(user.department) and user.department == department
