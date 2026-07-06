from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TaskCreate(BaseModel):
    title: str
    assignee_name: str
    assignee_id: Optional[int] = None
    deadline: Optional[datetime] = None
    status: str = "pending"
    document_id: Optional[int] = None
    note: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    assignee_name: Optional[str] = None
    assignee_id: Optional[int] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = None
    note: Optional[str] = None


class TaskStatusUpdate(BaseModel):
    status: str


class TaskResponse(BaseModel):
    id: int
    title: str
    assignee_name: str
    assignee_id: Optional[int] = None
    deadline: Optional[datetime] = None
    status: str
    document_id: Optional[int] = None
    document_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskExtractRequest(BaseModel):
    document_id: int


class TaskExtractPreview(BaseModel):
    tasks: List[TaskCreate]
    document_id: int
    document_name: str
    has_duplicates: bool = False
    duplicate_count: int = 0
