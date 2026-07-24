from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DocumentResponse(BaseModel):
    id: int
    filename: str
    page_count: int
    uploaded_by: int
    uploader_name: Optional[str] = None
    department: Optional[str] = None
    month: Optional[int] = None
    school_year: Optional[str] = None
    plan_title: Optional[str] = None
    plan_event_at: Optional[datetime] = None
    plan_event_end_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    page_size: int


class TaskPreviewItem(BaseModel):
    title: str
    assignee_name: str
    assignee_id: Optional[int] = None
    deadline: Optional[str] = None
    has_scheduled_time: bool = False
    status: str = "pending"
    document_id: Optional[int] = None
    note: Optional[str] = None


class TaskPreviewPayload(BaseModel):
    tasks: List[TaskPreviewItem] = []
    document_id: int
    document_name: Optional[str] = None
    has_duplicates: bool = False
    duplicate_count: int = 0


class DocumentUploadResponse(BaseModel):
    id: int
    filename: str
    page_count: int
    department: Optional[str] = None
    month: Optional[int] = None
    school_year: Optional[str] = None
    plan_title: Optional[str] = None
    plan_event_at: Optional[str] = None
    plan_event_end_at: Optional[str] = None
    include_in_calendar: bool = False
    extract_tasks: bool = False
    task_preview: Optional[TaskPreviewPayload] = None
    message: str
    campus_ids: Optional[List[int]] = None
    campuses: Optional[List[str]] = None


class PlanReExtractResponse(BaseModel):
    document_id: int
    plan_title: Optional[str] = None
    plan_event_at: Optional[str] = None
    plan_event_end_at: Optional[str] = None
    event_count: int = 0
    needs_review: bool = False
    message: str
