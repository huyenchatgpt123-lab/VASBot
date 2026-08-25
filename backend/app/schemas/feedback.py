from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class FeedbackCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class FeedbackAttachmentResponse(BaseModel):
    id: int
    filename: str
    content_type: Optional[str] = None
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    content: str
    status: str
    created_at: datetime
    attachments: List[FeedbackAttachmentResponse] = []

    class Config:
        from_attributes = True


class FeedbackListResponse(BaseModel):
    feedbacks: List[FeedbackResponse]
    total: int
