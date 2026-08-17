from app.models.user import User
from app.schemas.auth import UserResponse, UserPermissions, UserPositionBrief
from app.utils.permissions import get_permissions


def serialize_user(user: User) -> UserResponse:
    positions = list(getattr(user, "positions", None) or [])
    if not positions:
        pos = getattr(user, "position_obj", None)
        if pos:
            positions = [pos]

    # Stable order by sort_order then name
    positions = sorted(
        positions,
        key=lambda p: (getattr(p, "sort_order", 0) or 0, (p.name or "").lower()),
    )
    briefs = [UserPositionBrief(id=p.id, name=p.name) for p in positions]
    position_ids = [p.id for p in positions]

    primary = None
    if user.position_id:
        primary = next((p for p in positions if p.id == user.position_id), None)
    if not primary and positions:
        primary = positions[0]

    position_name = (
        ", ".join(p.name for p in positions)
        if positions
        else (primary.name if primary else user.position)
    )

    dept = getattr(user, "department_obj", None)
    department_name = dept.name if dept else user.department
    campus = getattr(user, "campus", None)
    return UserResponse(
        id=user.id,
        name=user.name,
        nickname=user.nickname,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        department=department_name,
        department_id=user.department_id,
        position=position_name,
        position_id=primary.id if primary else user.position_id,
        positions=briefs,
        position_ids=position_ids,
        teacher_code=user.teacher_code,
        campus_id=user.campus_id,
        campus_code=campus.code if campus else None,
        campus_name=campus.name if campus else None,
        permissions=UserPermissions(**get_permissions(user)),
        must_change_password=bool(user.must_change_password),
        created_at=user.created_at,
    )
