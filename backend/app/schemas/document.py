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
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentUploadResponse(BaseModel):
    id: int
    filename: str
    page_count: int
    department: Optional[str] = None
    month: Optional[int] = None
    school_year: Optional[str] = None
    message: str
