from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.timetable import (
    ClassRoomCreate,
    ClassRoomResponse,
    TimetableSlotCreate,
    TimetableSlotUpdate,
    TimetableSlotResponse,
    TimetableImportResult,
    MySubstitutesResponse,
)
from app.services.timetable_service import TimetableService
from app.utils.auth import get_current_user
from app.utils.permissions import is_admin, has_scope_all_departments

router = APIRouter(prefix="/substitutes", tags=["substitutes"])


def _require_bgh(user: User = Depends(get_current_user)) -> User:
    if not (is_admin(user) or has_scope_all_departments(user)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Ban giám hiệu / Admin mới dùng được chức năng này",
        )
    return user


# ---- teacher-facing: my substitute lessons ----

@router.get("/mine", response_model=MySubstitutesResponse)
def my_substitutes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return TimetableService(db).list_my_substitutes(current_user.id)


@router.get("/mine/count")
def my_substitutes_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": TimetableService(db).count_my_substitutes(current_user.id)}


@router.get("/teachers")
def list_teachers(
    campus_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    q = db.query(User).order_by(User.name)
    if campus_id:
        q = q.filter((User.campus_id == campus_id) | (User.campus_id.is_(None)))
    return [
        {
            "id": u.id,
            "name": u.name,
            "teacher_code": u.teacher_code,
            "department": u.department,
            "campus_id": u.campus_id,
        }
        for u in q.all()
    ]


# ---- classes ----

@router.get("/classes", response_model=List[ClassRoomResponse])
def list_classes(
    campus_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    return TimetableService(db).list_classes(campus_id)


@router.post("/classes", response_model=ClassRoomResponse, status_code=status.HTTP_201_CREATED)
def create_class(
    body: ClassRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    try:
        return TimetableService(db).create_class(
            name=body.name, campus_id=body.campus_id, grade=body.grade
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ---- timetable slots ----

@router.get("/timetable", response_model=List[TimetableSlotResponse])
def list_timetable(
    campus_id: Optional[int] = Query(None),
    teacher_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    return TimetableService(db).list_slots(
        campus_id=campus_id, teacher_id=teacher_id, class_id=class_id
    )


@router.post("/timetable", response_model=TimetableSlotResponse, status_code=status.HTTP_201_CREATED)
def create_timetable_slot(
    body: TimetableSlotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    try:
        return TimetableService(db).create_slot(
            teacher_id=body.teacher_id,
            class_id=body.class_id,
            campus_id=body.campus_id,
            day_of_week=body.day_of_week,
            period=body.period,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/timetable/{slot_id}", response_model=TimetableSlotResponse)
def update_timetable_slot(
    slot_id: int,
    body: TimetableSlotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    try:
        data = body.model_dump(exclude_unset=True)
        return TimetableService(db).update_slot(slot_id, **data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/timetable/{slot_id}")
def delete_timetable_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    try:
        TimetableService(db).delete_slot(slot_id)
        return {"message": "Đã xóa tiết"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/timetable/import", response_model=TimetableImportResult)
async def import_timetable(
    campus_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_bgh),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ chấp nhận file Excel (.xlsx)",
        )
    content = await file.read()
    try:
        return TimetableService(db).import_excel(content, campus_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi import: {e}",
        )
