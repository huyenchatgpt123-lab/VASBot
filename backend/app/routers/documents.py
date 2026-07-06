import logging
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from openai import AuthenticationError, APIConnectionError, RateLimitError

from app.database import get_db
from app.schemas.document import DocumentResponse, DocumentUploadResponse, DocumentListResponse
from app.services.document_service import DocumentService
from app.repositories.document_repository import DocumentRepository
from app.utils.auth import get_current_user, require_admin
from app.models.user import User
from app.models.document import DEPARTMENTS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["Documents"])


ALLOWED_EXTENSIONS = (".pdf", ".docx")


@router.get("/departments")
def get_departments(current_user: User = Depends(get_current_user)):
    return {"departments": DEPARTMENTS}


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    department: str = Form(...),
    month: int = Form(...),
    school_year: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chỉ chấp nhận file PDF hoặc Word (.docx)")

    content = await file.read()
    service = DocumentService(db)

    try:
        result = service.upload_document(
            content, file.filename, current_user.id,
            department=department, month=month, school_year=school_year,
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
            "created_at": doc.created_at,
        })
    return DocumentListResponse(
        documents=result,
        total=total,
        page=page,
        page_size=page_size,
    )


def _get_document_file(doc_id: int, token: Optional[str], db: Session):
    from app.utils.auth import get_current_user_from_token
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")

    repo = DocumentRepository(db)
    doc = repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    if not os.path.exists(doc.filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File không tồn tại trên server")
    return doc


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    doc = _get_document_file(doc_id, token, db)
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
    doc = _get_document_file(doc_id, token, db)
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
    current_user: User = Depends(require_admin),
):
    service = DocumentService(db)
    if not service.delete_document(doc_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại")
    return {"message": "Tài liệu đã được xóa"}
