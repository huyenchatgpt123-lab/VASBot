from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.utils.auth import get_current_user, require_admin
from app.models.user import User
from app.repositories.feedback_repository import FeedbackRepository
from app.schemas.feedback import FeedbackCreate, FeedbackResponse, FeedbackListResponse

router = APIRouter(prefix="/feedback", tags=["Feedback"])


def _format_feedback(fb) -> dict:
    return {
        "id": fb.id,
        "user_id": fb.user_id,
        "user_name": fb.user.name if fb.user else "Unknown",
        "user_email": fb.user.email if fb.user else "",
        "content": fb.content,
        "status": fb.status.value,
        "created_at": fb.created_at,
    }


@router.post("", response_model=FeedbackResponse)
def create_feedback(
    body: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = FeedbackRepository(db)
    fb = repo.create(current_user.id, body.content.strip())
    return FeedbackResponse(**_format_feedback(fb))


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
