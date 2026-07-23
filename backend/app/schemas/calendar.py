from pydantic import BaseModel
from typing import List, Optional


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
