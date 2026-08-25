from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from app.database import get_db
from app.utils.auth import get_current_user, require_admin
from app.utils.permissions import is_admin
from app.models.user import User
from app.repositories.feedback_repository import FeedbackRepository
from app.schemas.feedback import FeedbackResponse, FeedbackListResponse, FeedbackAttachmentResponse
from app.services.storage_service import upload_feedback_file, read_stored_file_bytes, delete_stored_file
from app.utils.upload_limits import read_upload_limited

router = APIRouter(prefix="/feedback", tags=["Feedback"])

FEEDBACK_MAX_FILES = 5
FEEDBACK_MAX_BYTES = 50 * 1024 * 1024  # 50MB — isolated from document upload limit
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
ALLOWED_EXTS = ALLOWED_IMAGE_EXTS | ALLOWED_VIDEO_EXTS


def _format_feedback(fb) -> dict:
    return {
        "id": fb.id,
        "user_id": fb.user_id,
        "user_name": fb.user.name if fb.user else "Unknown",
        "user_email": fb.user.email if fb.user else "",
        "content": fb.content,
        "status": fb.status.value if hasattr(fb.status, "value") else fb.status,
        "created_at": fb.created_at,
        "attachments": [
            FeedbackAttachmentResponse(
                id=a.id,
                filename=a.filename,
                content_type=a.content_type,
                size_bytes=a.size_bytes or 0,
                created_at=a.created_at,
            )
            for a in (fb.attachments or [])
        ],
    }


def _can_access_feedback(user: User, feedback) -> bool:
    if is_admin(user):
        return True
    return feedback.user_id == user.id


@router.post("", response_model=FeedbackResponse)
async def create_feedback(
    content: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = (content or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nội dung không được để trống")
    if len(text) > 2000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nội dung tối đa 2000 ký tự")

    uploads = [f for f in (files or []) if f and f.filename]
    if len(uploads) > FEEDBACK_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tối đa {FEEDBACK_MAX_FILES} file minh chứng",
        )

    repo = FeedbackRepository(db)
    stored_paths: List[str] = []
    try:
        fb = repo.create(current_user.id, text)

        for upload in uploads:
            filename = upload.filename or "file"
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File «{filename}» không hỗ trợ. Chỉ ảnh (jpg/png/webp/gif) hoặc video (mp4/webm/mov/m4v).",
                )
            raw = await read_upload_limited(upload, max_bytes=FEEDBACK_MAX_BYTES)
            path = upload_feedback_file(raw, filename)
            stored_paths.append(path)
            repo.add_attachment(
                feedback_id=fb.id,
                filename=filename,
                content_type=upload.content_type,
                size_bytes=len(raw),
                storage_path=path,
            )

        repo.commit()
        fb = repo.get_by_id(fb.id)
        return FeedbackResponse(**_format_feedback(fb))
    except HTTPException:
        for path in stored_paths:
            try:
                delete_stored_file(path)
            except Exception:
                pass
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        for path in stored_paths:
            try:
                delete_stored_file(path)
            except Exception:
                pass
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không gửi được feedback: {e}",
        )


@router.get("/mine", response_model=FeedbackListResponse)
def get_my_feedbacks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = FeedbackRepository(db)
    feedbacks = repo.get_by_user(current_user.id)
    return FeedbackListResponse(
        feedbacks=[FeedbackResponse(**_format_feedback(fb)) for fb in feedbacks],
        total=len(feedbacks),
    )


@router.get("", response_model=FeedbackListResponse)
def get_all_feedbacks(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    repo = FeedbackRepository(db)
    feedbacks, total = repo.get_all(status=status)
    return FeedbackListResponse(
        feedbacks=[FeedbackResponse(**_format_feedback(fb)) for fb in feedbacks],
        total=total,
    )


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    repo = FeedbackRepository(db)
    return {"count": repo.count_new()}


@router.patch("/{feedback_id}/read")
def mark_feedback_read(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    repo = FeedbackRepository(db)
    fb = repo.mark_read(feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback không tồn tại")
    return {"message": "Đã đánh dấu đã đọc"}


@router.get("/{feedback_id}/attachments/{attachment_id}")
def download_feedback_attachment(
    feedback_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = FeedbackRepository(db)
    fb = repo.get_by_id(feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback không tồn tại")
    if not _can_access_feedback(current_user, fb):
        raise HTTPException(status_code=403, detail="Không có quyền xem file này")

    att = repo.get_attachment(attachment_id)
    if not att or att.feedback_id != feedback_id:
        raise HTTPException(status_code=404, detail="File không tồn tại")

    try:
        data = read_stored_file_bytes(att.storage_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Không đọc được file: {e}")

    media = att.content_type or "application/octet-stream"
    headers = {
        "Content-Disposition": f'inline; filename="{att.filename}"',
    }
    return Response(content=data, media_type=media, headers=headers)
