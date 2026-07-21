from pydantic import BaseModel
from typing import List, Optional


class CampusResponse(BaseModel):
    id: int
    code: str
    name: str

    class Config:
        from_attributes = True


class BghCalendarTask(BaseModel):
    id: int
    title: str
    deadline: Optional[str] = None
    has_scheduled_time: bool
    campuses: List[str]
    document_name: Optional[str] = None


class BghCalendarResponse(BaseModel):
    scheduled_tasks: List[BghCalendarTask]
    unscheduled_tasks: List[BghCalendarTask]
    day_counts: dict[str, int]
