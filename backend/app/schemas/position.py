from pydantic import BaseModel
from typing import Optional


class PositionPermissions(BaseModel):
    can_upload: bool = False
    can_manage_tasks: bool = False
    can_delete_documents: bool = False
    scope_all_departments: bool = False
    can_access_substitutes: bool = False
    can_manage_calendar: bool = False
    can_import_timetable: bool = False
    bgh_workspace: bool = False


class PositionResponse(BaseModel):
    id: int
    name: str
    can_upload: bool
    can_manage_tasks: bool
    can_delete_documents: bool
    scope_all_departments: bool
    can_access_substitutes: bool = False
    can_manage_calendar: bool = False
    can_import_timetable: bool = False
    bgh_workspace: bool = False
    sort_order: int
    user_count: int = 0

    class Config:
        from_attributes = True


class PositionCreate(BaseModel):
    name: str
    can_upload: bool = False
    can_manage_tasks: bool = False
    can_delete_documents: bool = False
    scope_all_departments: bool = False
    can_access_substitutes: bool = False
    can_manage_calendar: bool = False
    can_import_timetable: bool = False
    bgh_workspace: bool = False
    sort_order: int = 0


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    can_upload: Optional[bool] = None
    can_manage_tasks: Optional[bool] = None
    can_delete_documents: Optional[bool] = None
    scope_all_departments: Optional[bool] = None
    can_access_substitutes: Optional[bool] = None
    can_manage_calendar: Optional[bool] = None
    can_import_timetable: Optional[bool] = None
    bgh_workspace: Optional[bool] = None
    sort_order: Optional[int] = None
