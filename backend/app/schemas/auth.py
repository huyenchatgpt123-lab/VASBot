from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserPermissions(BaseModel):
    can_upload: bool = False
    can_manage_tasks: bool = False
    can_delete_documents: bool = False
    scope_all_departments: bool = False


class UserCreate(BaseModel):
    name: str
    nickname: Optional[str] = None
    email: EmailStr
    password: str
    role: str = "user"
    department: Optional[str] = None
    department_id: Optional[int] = None
    position: Optional[str] = None
    position_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[int] = None
    position: Optional[str] = None
    position_id: Optional[int] = None


class UserResponse(BaseModel):
    id: int
    name: str
    nickname: Optional[str] = None
    email: str
    role: str
    department: Optional[str] = None
    department_id: Optional[int] = None
    position: Optional[str] = None
    position_id: Optional[int] = None
    permissions: UserPermissions = UserPermissions()
    must_change_password: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str
    confirm_password: str

