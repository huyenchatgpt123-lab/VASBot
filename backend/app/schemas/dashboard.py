from pydantic import BaseModel
from typing import List


class DashboardStats(BaseModel):
    total_documents: int
    total_pages: int
    total_users: int
    openai_cost_this_month: float


class ActivityData(BaseModel):
    date: str
    documents: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    activity: List[ActivityData]
