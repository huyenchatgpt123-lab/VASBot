from pydantic import BaseModel
from typing import List, Optional


class CloudinaryStats(BaseModel):
    storage_bytes: int
    file_count: int


class DashboardStats(BaseModel):
    total_documents: int
    total_pages: int
    total_users: int
    openai_cost_usd: float
    openai_cost_vnd: float
    cloudinary: Optional[CloudinaryStats] = None


class ActivityData(BaseModel):
    date: str
    documents: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    activity: List[ActivityData]
