from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class CampusResponse(BaseModel):
    id: int
    code: str
    name: str

    class Config:
        from_attributes = True


class BghCalendarPlan(BaseModel):
    event_id: Optional[int] = None
    document_id: int
    plan_name: str
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    campuses: List[str]
    is_continuation: bool = False
    event_end_date: Optional[str] = None
    needs_review: bool = False
    source: str = "ai"


class BghCalendarResponse(BaseModel):
    scheduled_plans: List[BghCalendarPlan]
    unscheduled_plans: List[BghCalendarPlan]
    day_counts: dict[str, int]


class PlanEventUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    starts_at: datetime
    ends_at: Optional[datetime] = None


class PlanEventCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    starts_at: datetime
    ends_at: Optional[datetime] = None


class PlanEventResponse(BaseModel):
    id: int
    document_id: int
    title: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    source: str
    needs_review: bool
    message: str = "Đã cập nhật sự kiện"
