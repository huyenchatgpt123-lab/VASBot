from pydantic import BaseModel
from typing import Optional


class PositionPermissions(BaseModel):
    can_upload: bool = False
    can_manage_tasks: bool = False
    can_delete_documents: bool = False
    scope_all_departments: bool = False


class PositionResponse(BaseModel):
    id: int
    name: str
    can_upload: bool
    can_manage_tasks: bool
    can_delete_documents: bool
    scope_all_departments: bool
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
    sort_order: int = 0


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    can_upload: Optional[bool] = None
    can_manage_tasks: Optional[bool] = None
    can_delete_documents: Optional[bool] = None
    scope_all_departments: Optional[bool] = None
    sort_order: Optional[int] = None
