from typing import Optional

from app.models.user import User, UserRole
from app.models.task import Task
from app.models.document import Document


def is_admin(user: User) -> bool:
    return user.role == UserRole.admin


def _position(user: User):
    return getattr(user, "position_obj", None)


def get_permissions(user: User) -> dict:
    if is_admin(user):
        return {
            "can_upload": True,
            "can_manage_tasks": True,
            "can_delete_documents": True,
            "scope_all_departments": True,
        }
    pos = _position(user)
    if not pos:
        return {
            "can_upload": False,
            "can_manage_tasks": False,
            "can_delete_documents": False,
            "scope_all_departments": False,
        }
    return {
        "can_upload": bool(pos.can_upload),
        "can_manage_tasks": bool(pos.can_manage_tasks),
        "can_delete_documents": bool(pos.can_delete_documents),
        "scope_all_departments": bool(pos.scope_all_departments),
    }


def can_upload(user: User) -> bool:
    return get_permissions(user)["can_upload"]


def can_manage_tasks(user: User) -> bool:
    return get_permissions(user)["can_manage_tasks"]


def can_delete_documents(user: User) -> bool:
    return get_permissions(user)["can_delete_documents"]


def has_scope_all_departments(user: User) -> bool:
    return get_permissions(user)["scope_all_departments"]


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


def can_upload_to_department(user: User, department: str) -> bool:
    if not can_upload(user):
        return False
    if is_admin(user) or has_scope_all_departments(user):
        return True
    return bool(user.department) and user.department == department
