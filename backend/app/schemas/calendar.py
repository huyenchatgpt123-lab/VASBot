from pydantic import BaseModel
from typing import List, Optional


class CampusResponse(BaseModel):
    id: int
    code: str
    name: str

    class Config:
        from_attributes = True


class BghCalendarPlan(BaseModel):
    document_id: int
    plan_name: str
    date: Optional[str] = None
    start_time: Optional[str] = None
    campuses: List[str]


class BghCalendarResponse(BaseModel):
    scheduled_plans: List[BghCalendarPlan]
    unscheduled_plans: List[BghCalendarPlan]
    day_counts: dict[str, int]
