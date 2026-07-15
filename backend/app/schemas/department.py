from pydantic import BaseModel
from typing import Optional


class DepartmentResponse(BaseModel):
    id: int
    name: str
    sort_order: int
    user_count: int = 0

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    sort_order: int = 0


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
