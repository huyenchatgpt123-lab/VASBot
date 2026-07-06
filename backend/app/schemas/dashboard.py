from pydantic import BaseModel
from typing import List


class DashboardStats(BaseModel):
    total_documents: int
    total_pages: int
    total_users: int
    total_conversations: int
    total_ai_questions: int
    openai_cost_this_month: float


class ActivityData(BaseModel):
    date: str
    conversations: int
    questions: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    activity: List[ActivityData]
