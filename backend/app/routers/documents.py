import logging

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from openai import AuthenticationError, APIConnectionError, RateLimitError

from app.database import get_db
from app.schemas.document import DocumentUploadResponse, DocumentListResponse, PlanReExtractResponse
from app.services.document_service import DocumentService
from app.repositories.document_repository import DocumentRepository
from app.services.storage_service import (
    parse_storage_ref,
    file_exists,
    get_preview_url,
    get_download_url,
)
from app.utils.auth import get_current_user, require_admin
from app.utils.permissions import can_upload, can_upload_to_department, can_delete_document, has_scope_all_departments, is_admin
from app.models.user import User, UserRole
from app.repositories.department_repository import DepartmentRepository
from app.repositories.campus_repository import CampusRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["Documents"])


ALLOWED_EXTENSIONS = (".pdf", ".docx")


@router.get("/departments")
def get_departments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    dept_repo = DepartmentRepository(db)
    return {"departments": dept_repo.get_names()}


@router.get("/campuses")
def get_campuses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    campus_repo = CampusRepository(db)
    campuses = campus_repo.get_all()
    return {
        "campuses": [{"id": c.id, "code": c.code, "name": c.name} for c in campuses],
    }


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    department: str = Form(...),
    month: int = Form(...),
    school_year: str = Form(...),
    campus_ids: List[int] = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not can_upload(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền upload tài liệu")

    dept_repo = DepartmentRepository(db)
    if not dept_repo.get_by_name(department):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phòng ban không hợp lệ")

    upload_department = department
    if not is_admin(current_user) and not has_scope_all_departments(current_user):
        if not current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản chưa được gán tổ")
        upload_department = current_user.department
    elif not can_upload_to_department(current_user, upload_department):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền upload cho tổ này")

    if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chỉ chấp nhận file PDF hoặc Word (.docx)")

    campus_repo = CampusRepository(db)
    campuses = campus_repo.get_by_ids(campus_ids)
    if not campuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vui lòng chọn ít nhất một trường (VA1, VA3, EMC)")

    content = await file.read()
    service = DocumentService(db)

    try:
        result = service.upload_document(
            content, file.filename, current_user.id,
            department=upload_department, month=month, school_year=school_year,
            campus_ids=[c.id for c in campuses],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except AuthenticationError:
        logger.error("OpenAI API key không hợp lệ")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key không hợp lệ. Vui lòng kiểm tra cấu hình.",
        )
    except (APIConnectionError, ConnectionError):
        logger.error("Không thể kết nối OpenAI API")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể kết nối đến OpenAI. Vui lòng kiểm tra API key và kết nối mạng.",
        )
    except RateLimitError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Đã vượt giới hạn OpenAI. Vui lòng thử lại sau.",
        )
    except Exception as e:
        logger.error(f"Lỗi upload tài liệu: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi xử lý tài liệu: {str(e)}",
        )

    return DocumentUploadResponse(**result)


@router.get("", response_model=DocumentListResponse)
def get_documents(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    month_filter: Optional[int] = Query(None, alias="month"),
    school_year: Optional[str] = Query(None),
    sort_by: str = Query("created_at", pattern="^(filename|created_at|page_count)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = DocumentRepository(db)
    docs, total = repo.get_paginated(
        search=search, sort_by=sort_by, order=order, page=page, page_size=page_size,
        department=department, month=month_filter, school_year=school_year,
    )
    result = []
    for doc in docs:
        result.append({
            "id": doc.id,
            "filename": doc.filename,
            "page_count": doc.page_count,
            "uploaded_by": doc.uploaded_by,
            "uploader_name": doc.uploader.name if doc.uploader else None,
            "department": doc.department,
            "month": doc.month,
            "school_year": doc.school_year,
            "plan_title": doc.plan_title,
            "plan_event_at": doc.plan_event_at,
            "created_at": doc.created_at,
        })
    return DocumentListResponse(
        documents=result,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{doc_id}/re-extract-plan", response_model=PlanReExtractResponse)
def re_extract_plan_metadata(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ Admin mới có quyền trích xuất lại")

    repo = DocumentRepository(db)
    doc = repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    if not file_exists(doc.filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File không tồn tại trên server")

    service = DocumentService(db)
    try:
        result = service.re_extract_plan_metadata(doc_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Lỗi re-extract kế hoạch {doc_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi trích xuất lại: {str(e)}",
        )

    return PlanReExtractResponse(**result)


def _get_authenticated_document(doc_id: int, token: Optional[str], db: Session):
    from app.utils.auth import get_current_user_from_token
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")

    repo = DocumentRepository(db)
    doc = repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    if not file_exists(doc.filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File không tồn tại trên server")
    return doc


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    doc = _get_authenticated_document(doc_id, token, db)
    kind, _, _ = parse_storage_ref(doc.filepath)

    if kind == "cloudinary":
        url = get_preview_url(doc.filepath, doc.filename)
        return RedirectResponse(url=url)

    media_type = "application/pdf" if doc.filename.lower().endswith(".pdf") else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return FileResponse(
        path=doc.filepath,
        filename=doc.filename,
        media_type=media_type,
        content_disposition_type="inline",
    )


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    doc = _get_authenticated_document(doc_id, token, db)
    kind, _, _ = parse_storage_ref(doc.filepath)

    if kind == "cloudinary":
        url = get_download_url(doc.filepath, doc.filename)
        return RedirectResponse(url=url)

    media_type = "application/pdf" if doc.filename.lower().endswith(".pdf") else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return FileResponse(
        path=doc.filepath,
        filename=doc.filename,
        media_type=media_type,
        content_disposition_type="attachment",
    )


@router.get("/{doc_id}/view")
def view_document(
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Alias for /preview (backward compatibility)."""
    return preview_document(doc_id, token, db)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = DocumentRepository(db)
    doc = repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    if not can_delete_document(current_user, doc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xóa tài liệu này")

    service = DocumentService(db)
    if not service.delete_document(doc_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    return {"message": "Tài liệu đã được xóa"}
