from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.user import User, UserRole
from app.services.task_service import TaskService
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskStatusUpdate,
    TaskResponse, TaskListResponse, TaskExtractRequest,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


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

    if current_user.role == UserRole.admin:
        tasks, total = service.get_all_tasks(
            page, page_size, status=status,
            assignee_name=assignee_name, sort_by=sort_by, order=order
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


@router.patch("/{task_id}/status")
def update_task_status(
    task_id: int,
    body: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TaskService(db)
    is_admin = current_user.role == UserRole.admin
    try:
        task = service.update_status(task_id, body.status, current_user.id, is_admin)
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
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền chỉnh sửa")

    service = TaskService(db)
    update_data = body.model_dump(exclude_unset=True)
    task = service.update_task(task_id, **update_data)
    if not task:
        raise HTTPException(status_code=404, detail="Công việc không tồn tại")
    return {"message": "Cập nhật thành công"}


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền xóa")

    service = TaskService(db)
    if not service.delete_task(task_id):
        raise HTTPException(status_code=404, detail="Công việc không tồn tại")
    return {"message": "Đã xóa công việc"}


@router.post("", response_model=dict)
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền tạo")

    service = TaskService(db)
    task_data = body.model_dump()
    if not task_data.get("assignee_id"):
        task_data["assignee_id"] = service._match_user(task_data["assignee_name"])

    from app.models.task import TaskStatus
    task_data["status"] = TaskStatus(task_data.get("status", "pending"))

    task = service.repo.create(**task_data)
    return {"message": "Đã tạo công việc", "task_id": task.id}
