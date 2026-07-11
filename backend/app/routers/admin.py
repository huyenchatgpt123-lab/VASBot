import io
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from openpyxl import load_workbook

from app.database import get_db
from app.schemas.auth import UserResponse, UserCreate, UserUpdate
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard_service import DashboardService
from app.services.auth_service import AuthService
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.utils.auth import require_admin, hash_password
from app.utils.excel_user_import import build_column_map, parse_user_row, is_empty_row
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    service = DashboardService(db)
    data = service.get_dashboard(start_date=start_date, end_date=end_date)
    return DashboardResponse(**data)


@router.get("/users", response_model=List[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    repo = UserRepository(db)
    users = repo.get_all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    service = AuthService(db)
    try:
        user = service.create_user(data)
        TaskService(db).rematch_assignees(user_id=user.id)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    update_fields = {}
    if data.name is not None:
        update_fields["name"] = data.name
    if data.email is not None:
        existing = repo.get_by_email(data.email)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã được sử dụng")
        update_fields["email"] = data.email
    if data.password is not None:
        update_fields["password_hash"] = hash_password(data.password)
    if data.role is not None:
        update_fields["role"] = data.role
    if data.department is not None:
        update_fields["department"] = data.department or None
    if data.position is not None:
        update_fields["position"] = data.position or None
    if data.nickname is not None:
        nickname = data.nickname.strip()
        if not nickname:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Biệt danh không được để trống",
            )
        if repo.nickname_exists(nickname, exclude_id=user_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Biệt danh '{nickname}' đã được sử dụng",
            )
        update_fields["nickname"] = nickname

    updated = repo.update(user_id, **update_fields)
    if "nickname" in update_fields:
        TaskService(db).rematch_assignees(user_id=user_id)
    return UserResponse.model_validate(updated)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể xóa tài khoản của bạn")

    repo = UserRepository(db)
    try:
        if not repo.delete(user_id, reassign_documents_to=current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"message": "Người dùng đã được xóa"}


@router.post("/users/import-excel")
async def import_users_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chỉ chấp nhận file Excel (.xlsx)")

    content = await file.read()
    try:
        wb = load_workbook(filename=io.BytesIO(content), read_only=True)
        ws = wb.active
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File Excel không hợp lệ")

    service = AuthService(db)
    repo = UserRepository(db)
    created = 0
    skipped = 0
    errors = []

    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File Excel trống")

    column_map = build_column_map(all_rows[0])
    data_rows = all_rows[1:]
    seen_nicknames: set[str] = set()

    for i, row in enumerate(data_rows, start=2):
        if is_empty_row(row):
            continue

        parsed = parse_user_row(row, column_map)
        name = parsed["name"] or ""
        email = parsed["email"] or ""
        password = parsed["password"] or ""
        nickname = parsed["nickname"] or ""

        if not name or not email or not password:
            errors.append(f"Dòng {i}: thiếu họ tên, email hoặc mật khẩu")
            skipped += 1
            continue

        if not nickname:
            errors.append(f"Dòng {i}: thiếu biệt danh (cột F)")
            skipped += 1
            continue

        nickname_key = nickname.lower()
        if nickname_key in seen_nicknames:
            errors.append(f"Dòng {i}: biệt danh '{nickname}' bị trùng trong file")
            skipped += 1
            continue
        seen_nicknames.add(nickname_key)

        existing = repo.get_by_email(email)
        if existing:
            errors.append(f"Dòng {i}: email {email} đã tồn tại")
            skipped += 1
            continue

        if repo.nickname_exists(nickname):
            errors.append(f"Dòng {i}: biệt danh '{nickname}' đã tồn tại")
            skipped += 1
            continue

        try:
            user_data = UserCreate(
                name=name,
                nickname=nickname,
                email=email,
                password=password,
                role=parsed["role"] or "user",
                department=parsed["department"],
                position=parsed["position"],
            )
            new_user = service.create_user(user_data)
            TaskService(db).rematch_assignees(user_id=new_user.id)
            created += 1
        except Exception as e:
            errors.append(f"Dòng {i}: {str(e)}")
            skipped += 1

    return {
        "message": f"Import hoàn tất: {created} người dùng được tạo, {skipped} bị bỏ qua",
        "created": created,
        "skipped": skipped,
        "errors": errors[:50],
    }
