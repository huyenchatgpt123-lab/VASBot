from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class CampusResponse(BaseModel):
    id: int
    code: str
    name: str

    class Config:
        from_attributes = True


class TimelineSlot(BaseModel):
    start: str
    end: Optional[str] = None
    title: str


class BghCalendarPlan(BaseModel):
    event_id: Optional[int] = None
    document_id: int
    plan_name: str
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    timeline: Optional[List[TimelineSlot]] = None
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
    location: Optional[str] = Field(None, max_length=300)


class PlanEventCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    starts_at: datetime
    ends_at: Optional[datetime] = None
    location: Optional[str] = Field(None, max_length=300)


class PlanEventResponse(BaseModel):
    id: int
    document_id: int
    title: str
    location: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    source: str
    needs_review: bool
    message: str = "Đã cập nhật sự kiện"
