from app.models.user import User
from app.schemas.auth import UserResponse, UserPermissions
from app.utils.permissions import get_permissions


def serialize_user(user: User) -> UserResponse:
    pos = getattr(user, "position_obj", None)
    position_name = pos.name if pos else user.position
    dept = getattr(user, "department_obj", None)
    department_name = dept.name if dept else user.department
    return UserResponse(
        id=user.id,
        name=user.name,
        nickname=user.nickname,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        department=department_name,
        department_id=user.department_id,
        position=position_name,
        position_id=user.position_id,
        permissions=UserPermissions(**get_permissions(user)),
        created_at=user.created_at,
    )
