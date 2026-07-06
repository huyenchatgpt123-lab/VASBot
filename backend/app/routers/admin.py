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
from app.repositories.user_repository import UserRepository
from app.utils.auth import require_admin, hash_password
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
        update_fields["department"] = data.department

    updated = repo.update(user_id, **update_fields)
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
    if not repo.delete(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")
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

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    for i, row in enumerate(rows, start=2):
        if not row or len(row) < 3:
            skipped += 1
            continue

        name = str(row[0]).strip() if row[0] else ""
        email = str(row[1]).strip() if row[1] else ""
        password = str(row[2]).strip() if row[2] else ""
        role = str(row[3]).strip().lower() if len(row) > 3 and row[3] else "user"
        department = str(row[4]).strip() if len(row) > 4 and row[4] else None

        if not name or not email or not password:
            errors.append(f"Dòng {i}: thiếu thông tin bắt buộc")
            skipped += 1
            continue

        if role not in ("admin", "user"):
            role = "user"

        existing = repo.get_by_email(email)
        if existing:
            errors.append(f"Dòng {i}: email {email} đã tồn tại")
            skipped += 1
            continue

        try:
            user_data = UserCreate(name=name, email=email, password=password, role=role, department=department)
            service.create_user(user_data)
            created += 1
        except Exception as e:
            errors.append(f"Dòng {i}: {str(e)}")
            skipped += 1

    return {
        "message": f"Import hoàn tất: {created} người dùng được tạo, {skipped} bị bỏ qua",
        "created": created,
        "skipped": skipped,
        "errors": errors[:20],
    }
