from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ClassRoomResponse(BaseModel):
    id: int
    name: str
    grade: Optional[int] = None
    campus_id: int
    campus_code: Optional[str] = None

    class Config:
        from_attributes = True


class ClassRoomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    campus_id: int
    grade: Optional[int] = None


class TimetableSlotResponse(BaseModel):
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    teacher_code: Optional[str] = None
    teacher_department: Optional[str] = None
    class_id: int
    class_name: Optional[str] = None
    campus_id: int
    campus_code: Optional[str] = None
    day_of_week: int
    period: int
    session: str
    period_label: str


class TimetableSlotCreate(BaseModel):
    teacher_id: int
    class_id: int
    campus_id: int
    day_of_week: int = Field(..., ge=2, le=7)
    period: int = Field(..., ge=1, le=8)


class TimetableSlotUpdate(BaseModel):
    teacher_id: Optional[int] = None
    class_id: Optional[int] = None
    day_of_week: Optional[int] = Field(None, ge=2, le=7)
    period: Optional[int] = Field(None, ge=1, le=8)


class TimetableImportResult(BaseModel):
    campus_id: int
    campus_code: str
    slots_created: int
    classes_created: int
    teachers_matched: int
    teachers_unmatched: List[str] = []
    errors: List[str] = []
    message: str


class SubstituteAssignmentResponse(BaseModel):
    id: int
    date: date
    period: int
    session: str
    period_label: str
    class_id: int
    class_name: Optional[str] = None
    campus_id: int
    campus_code: Optional[str] = None
    absent_teacher_id: int
    absent_teacher_name: Optional[str] = None
    substitute_teacher_id: Optional[int] = None
    substitute_teacher_name: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None


class MySubstitutesResponse(BaseModel):
    items: List[SubstituteAssignmentResponse]
    count: int


class AbsentPeriodsRequest(BaseModel):
    absent_teacher_id: int
    dates: List[date] = Field(..., min_length=1)


class AbsentPeriodItem(BaseModel):
    date: str
    day_of_week: int
    period: int
    session: str
    period_label: str
    class_id: int
    class_name: Optional[str] = None
    campus_id: int
    campus_code: Optional[str] = None
    already_assigned: bool = False
    existing_assignment_id: Optional[int] = None
    existing_substitute_name: Optional[str] = None


class SuggestTeacherItem(BaseModel):
    user_id: int
    name: str
    teacher_code: Optional[str] = None
    department: Optional[str] = None
    campus_id: Optional[int] = None
    same_department: bool
    tier_label: str
    periods_that_day: int
    substitutes_this_week: int


class AssignItem(BaseModel):
    absent_teacher_id: int
    substitute_teacher_id: int
    class_id: int
    campus_id: int
    date: date
    period: int = Field(..., ge=1, le=8)


class AssignBatchRequest(BaseModel):
    items: List[AssignItem] = Field(..., min_length=1)


class AssignBatchResponse(BaseModel):
    created: int
    items: List[SubstituteAssignmentResponse]
    errors: List[str] = []
    message: str
