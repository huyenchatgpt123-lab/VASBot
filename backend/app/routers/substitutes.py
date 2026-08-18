from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.timetable import (
    ClassRoomCreate,
    ClassRoomResponse,
    TimetableSlotCreate,
    TimetableSlotUpdate,
    TimetableSlotResponse,
    TimetableImportResult,
    TimetableImportMetaResponse,
    MySubstitutesResponse,
    MyTimetableSummary,
    SubstituteAssignmentResponse,
    RejectSubstituteRequest,
    CancelSubstituteRequest,
    ReassignSubstituteRequest,
    AbsentPeriodsRequest,
    AbsentPeriodItem,
    SuggestTeacherItem,
    AssignBatchRequest,
    AssignBatchResponse,
)
from app.services.timetable_service import TimetableService
from app.services.substitute_service import SubstituteService
from app.utils.auth import get_current_user
from app.utils.permissions import (
    is_admin,
    can_access_substitutes,
    can_import_timetable,
    can_view_substitutes_board,
    is_department_team_lead,
)
from app.utils.upload_limits import read_upload_limited

router = APIRouter(prefix="/substitutes", tags=["substitutes"])


def _require_substitutes_access(user: User = Depends(get_current_user)) -> User:
    if not can_access_substitutes(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền dùng chức năng Dạy thay",
        )
    return user


def _require_substitutes_board_view(user: User = Depends(get_current_user)) -> User:
    """BGH quản lý hoặc tổ trưởng xem read-only."""
    if not can_view_substitutes_board(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền xem lịch dạy thay",
        )
    return user

@router.get("/mine", response_model=MySubstitutesResponse)
def my_substitutes(
    teacher_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_id = current_user.id
    if teacher_id is not None and teacher_id != current_user.id:
        if not is_admin(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Admin mới xem lịch dạy thay của giáo viên khác",
            )
        target_id = teacher_id
    return TimetableService(db).list_my_substitutes(
        target_id,
        from_today=from_date is None and to_date is None,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/mine/count")
def my_substitutes_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": TimetableService(db).count_my_substitutes(current_user.id)}


@router.get("/mine/summary", response_model=MyTimetableSummary)
def my_timetable_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return TimetableService(db).my_timetable_summary(current_user.id)


@router.get("/mine/timetable", response_model=List[TimetableSlotResponse])
def my_timetable(
    teacher_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_id = current_user.id
    if teacher_id is not None and teacher_id != current_user.id:
        if not is_admin(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Admin mới xem thời khóa biểu của giáo viên khác",
            )
        target_id = teacher_id
    return TimetableService(db).list_my_timetable(target_id)


@router.get("/teachers")
def list_teachers(
    campus_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_board_view),
):
    q = db.query(User).filter(User.role != UserRole.admin).order_by(User.name)
    if campus_id:
        q = q.filter((User.campus_id == campus_id) | (User.campus_id.is_(None)))
    # Tổ trưởng chỉ cần danh sách tổ mình (read-only board)
    if is_department_team_lead(current_user) and not can_access_substitutes(current_user):
        q = q.filter(User.department == current_user.department)
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


@router.get("/assignments", response_model=List[SubstituteAssignmentResponse])
def list_assignments(
    from_date: date = Query(...),
    to_date: date = Query(...),
    campus_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_board_view),
):
    department = None
    if is_department_team_lead(current_user) and not can_access_substitutes(current_user):
        department = current_user.department
    return SubstituteService(db).list_board(
        from_date=from_date,
        to_date=to_date,
        campus_id=campus_id,
        department=department,
    )


@router.post("/absent-periods", response_model=List[AbsentPeriodItem])
def absent_periods(
    body: AbsentPeriodsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return SubstituteService(db).absent_periods(
            absent_teacher_id=body.absent_teacher_id,
            dates=body.dates,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/suggestions", response_model=List[SuggestTeacherItem])
def suggestions(
    absent_teacher_id: int = Query(...),
    on_date: date = Query(...),
    period: int = Query(..., ge=1, le=8),
    class_id: int = Query(...),
    campus_id: int = Query(...),
    limit: int = Query(20, ge=1, le=200),
    q: Optional[str] = Query(None, description="Tìm theo tên / tổ / mã GV"),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return SubstituteService(db).suggest(
            absent_teacher_id=absent_teacher_id,
            on_date=on_date,
            period=period,
            class_id=class_id,
            campus_id=campus_id,
            limit=limit,
            q=q,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/assign", response_model=AssignBatchResponse)
def assign_batch(
    body: AssignBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return SubstituteService(db).assign_batch(
            items=[i.model_dump() for i in body.items],
            assigned_by_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/assignments/{assignment_id}/confirm", response_model=SubstituteAssignmentResponse)
def confirm_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return SubstituteService(db).confirm(assignment_id, actor=current_user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/assignments/{assignment_id}/reject", response_model=SubstituteAssignmentResponse)
def reject_assignment(
    assignment_id: int,
    body: RejectSubstituteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return SubstituteService(db).reject(
            assignment_id, actor=current_user, reason=body.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/assignments/{assignment_id}/cancel", response_model=SubstituteAssignmentResponse)
def cancel_assignment(
    assignment_id: int,
    body: CancelSubstituteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return SubstituteService(db).cancel(assignment_id, reason=body.reason)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/assignments/{assignment_id}/reassign", response_model=SubstituteAssignmentResponse)
def reassign_assignment(
    assignment_id: int,
    body: ReassignSubstituteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return SubstituteService(db).reassign(
            assignment_id,
            substitute_teacher_id=body.substitute_teacher_id,
            reason=body.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/classes", response_model=List[ClassRoomResponse])
def list_classes(
    campus_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    return TimetableService(db).list_classes(campus_id)


@router.post("/classes", response_model=ClassRoomResponse, status_code=status.HTTP_201_CREATED)
def create_class(
    body: ClassRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        return TimetableService(db).create_class(
            name=body.name, campus_id=body.campus_id, grade=body.grade
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/timetable", response_model=List[TimetableSlotResponse])
def list_timetable(
    campus_id: Optional[int] = Query(None),
    teacher_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
):
    return TimetableService(db).list_slots(
        campus_id=campus_id, teacher_id=teacher_id, class_id=class_id
    )


@router.post("/timetable", response_model=TimetableSlotResponse, status_code=status.HTTP_201_CREATED)
def create_timetable_slot(
    body: TimetableSlotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_substitutes_access),
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
    current_user: User = Depends(_require_substitutes_access),
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
    current_user: User = Depends(_require_substitutes_access),
):
    try:
        TimetableService(db).delete_slot(slot_id)
        return {"message": "Đã xóa tiết"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/timetable/last-import", response_model=TimetableImportMetaResponse)
def get_timetable_last_import(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return TimetableImportMetaResponse(**TimetableService(db).get_last_import())


@router.post("/timetable/import", response_model=TimetableImportResult)
async def import_timetable(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.system_busy_service import (
        JOB_IMPORT_TIMETABLE,
        set_busy,
        clear_busy,
    )

    if not can_import_timetable(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền import thời khóa biểu",
        )
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ chấp nhận file Excel (.xlsx)",
        )
    content = await read_upload_limited(file)
    set_busy(db, JOB_IMPORT_TIMETABLE, started_by_id=current_user.id)
    try:
        return TimetableService(db).import_excel(content)
    except ValueError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi import: {e}",
        )
    finally:
        clear_busy(db, JOB_IMPORT_TIMETABLE)


@router.post("/timetable/import-merge", response_model=TimetableImportResult)
async def import_timetable_merge(
    file: UploadFile = File(...),
    overwrite: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Thêm/cập nhật TKB chỉ cho GV trong file; không xóa TKB của GV khác."""
    from app.services.system_busy_service import (
        JOB_IMPORT_TIMETABLE,
        set_busy,
        clear_busy,
    )

    if not can_import_timetable(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền import thời khóa biểu",
        )
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ chấp nhận file Excel (.xlsx)",
        )
    content = await read_upload_limited(file)
    set_busy(db, JOB_IMPORT_TIMETABLE, started_by_id=current_user.id)
    try:
        return TimetableService(db).import_excel_merge(content, overwrite=overwrite)
    except ValueError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi import: {e}",
        )
    finally:
        clear_busy(db, JOB_IMPORT_TIMETABLE)
