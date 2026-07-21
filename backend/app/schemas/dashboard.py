from pydantic import BaseModel
from typing import List, Optional


class CloudinaryStats(BaseModel):
    storage_bytes: int
    file_count: int


class OpenAILineItemCost(BaseModel):
    line_item: str
    cost_usd: float


class DashboardStats(BaseModel):
    total_documents: int
    total_pages: int
    total_users: int
    openai_cost_usd: float
    openai_cost_vnd: float
    openai_cost_source: str
    openai_cost_note: Optional[str] = None
    openai_line_items: Optional[List[OpenAILineItemCost]] = None
    cloudinary: Optional[CloudinaryStats] = None


class ActivityData(BaseModel):
    date: str
    documents: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    activity: List[ActivityData]
