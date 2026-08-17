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


def _iter_positions(user: User):
    """All assigned positions (M2M), fallback to primary position_obj."""
    positions = list(getattr(user, "positions", None) or [])
    if positions:
        return positions
    pos = getattr(user, "position_obj", None)
    return [pos] if pos else []


def get_permissions(user: User) -> dict:
    if is_admin(user):
        # Admin has all operational rights; BGH workspace is a non-admin UI profile.
        return {key: (False if key == "bgh_workspace" else True) for key in _PERM_KEYS}

    positions = _iter_positions(user)
    if not positions:
        return {key: False for key in _PERM_KEYS}

    perms = {key: False for key in _PERM_KEYS}
    for pos in positions:
        for key in _PERM_KEYS:
            if bool(getattr(pos, key, False)):
                perms[key] = True
    return perms


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


def is_department_team_lead(user: User) -> bool:
    """Tổ trưởng: có chức vụ quản lý task trong tổ (không tính BGH scope-all thuần)."""
    if is_admin(user):
        return False
    if not user.department:
        return False
    for pos in _iter_positions(user):
        if bool(getattr(pos, "can_manage_tasks", False)) and not bool(
            getattr(pos, "scope_all_departments", False)
        ):
            return True
    return False


def can_view_substitutes_board(user: User) -> bool:
    """BGH/Học vụ quản lý dạy thay, hoặc tổ trưởng xem read-only theo tổ."""
    return can_access_substitutes(user) or is_department_team_lead(user)


def can_manage_calendar(user: User) -> bool:
    return get_permissions(user)["can_manage_calendar"]


def can_import_timetable(user: User) -> bool:
    return get_permissions(user)["can_import_timetable"]


def has_bgh_workspace(user: User) -> bool:
    """Có ít nhất một chức vụ BGH (dùng cho home /bgh-calendar)."""
    if is_admin(user):
        return False
    return get_permissions(user)["bgh_workspace"]


def is_bgh_only_workspace(user: User) -> bool:
    """Ẩn TKB + Công việc: BGH thuần, không kiêm chức vụ có can_manage_tasks."""
    if is_admin(user):
        return False
    perms = get_permissions(user)
    return bool(perms["bgh_workspace"]) and not bool(perms["can_manage_tasks"])


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
