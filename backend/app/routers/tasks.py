from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.user import User, UserRole
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.utils.permissions import (
    is_admin,
    can_manage_tasks,
)
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskStatusUpdate,
    TaskResponse, TaskListResponse, TaskExtractRequest,
    TaskBatchCreate, TaskGroupUpdate,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _require_task_manager(current_user: User = Depends(get_current_user)) -> User:
    if is_admin(current_user) or can_manage_tasks(current_user):
        return current_user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền quản lý công việc")


@router.get("", response_model=TaskListResponse)
def get_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    assignee_name: Optional[str] = Query(None),
    sort_by: str = Query("deadline"),
    order: str = Query("asc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TaskService(db)

    if is_admin(current_user) or can_manage_tasks(current_user):
        tasks, total = service.get_tasks_for_manager(
            current_user, page, page_size, status=status,
            assignee_name=assignee_name, sort_by=sort_by, order=order,
        )
    else:
        tasks, total = service.get_tasks_for_user(
            current_user.id, page, page_size,
            status=status, sort_by=sort_by, order=order
        )

    return {
        "tasks": tasks,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/assignees")
def get_assignees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TaskService(db)
    names = service.get_assignee_names()
    return {"assignees": names}


@router.get("/users")
def get_task_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    user_repo = UserRepository(db)
    users = user_repo.get_all()
    return [
        {"id": u.id, "name": u.name, "nickname": u.nickname, "department": u.department}
        for u in users
    ]


@router.post("/rematch-assignees")
def rematch_assignees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền cập nhật phân công")

    service = TaskService(db)
    return service.rematch_assignees()


@router.patch("/{task_id}/status")
def update_task_status(
    task_id: int,
    body: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TaskService(db)
    try:
        task = service.update_status(task_id, body.status, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    if not task:
        raise HTTPException(status_code=404, detail="Công việc không tồn tại")
    return {"message": "Cập nhật thành công", "task_id": task.id, "status": task.status.value}


@router.post("/extract")
def extract_tasks(
    body: TaskExtractRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền trích xuất")

    service = TaskService(db)
    try:
        result = service.extract_tasks_from_document(body.document_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return result


@router.post("/save")
def save_tasks(
    document_id: int = Query(...),
    replace: bool = Query(False),
    tasks: List[TaskCreate] = ...,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền lưu")

    service = TaskService(db)
    tasks_data = [t.model_dump() for t in tasks]
    saved = service.save_extracted_tasks(document_id, tasks_data, replace=replace)
    return {"message": f"Đã lưu {len(saved)} công việc", "count": len(saved)}


@router.put("/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    update_data = body.model_dump(exclude_unset=True)
    try:
        task = service.update_task(task_id, current_user, **update_data)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    if not task:
        raise HTTPException(status_code=404, detail="Công việc không tồn tại")
    return {"message": "Cập nhật thành công"}


@router.delete("/by-document")
def delete_tasks_by_document(
    document_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    try:
        count = service.delete_tasks_by_document(document_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return {"message": f"Đã xóa {count} công việc", "count": count}


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    try:
        if not service.delete_task(task_id, current_user):
            raise HTTPException(status_code=404, detail="Công việc không tồn tại")
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return {"message": "Đã xóa công việc"}


@router.post("/batch")
def create_tasks_batch(
    body: TaskBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    try:
        created = service.create_tasks_batch(
            current_user,
            body.title,
            body.assignee_ids,
            deadline=body.deadline,
            document_id=body.document_id,
            note=body.note,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return {"message": f"Đã tạo {len(created)} công việc", "count": len(created)}


@router.put("/group")
def update_task_group(
    body: TaskGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    try:
        service.sync_task_group(
            current_user,
            body.task_ids,
            body.title,
            body.assignee_ids,
            deadline=body.deadline,
            document_id=body.document_id,
            note=body.note,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return {"message": "Cập nhật thành công", "count": len(body.assignee_ids)}


@router.post("", response_model=dict)
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_task_manager),
):
    service = TaskService(db)
    task_data = body.model_dump()
    if not task_data.get("assignee_id"):
        task_data["assignee_id"] = service._match_user(task_data["assignee_name"])

    from app.models.task import TaskStatus
    task_data["status"] = TaskStatus(task_data.get("status", "pending"))

    try:
        task = service.create_task(current_user, task_data)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return {"message": "Đã tạo công việc", "task_id": task.id}
