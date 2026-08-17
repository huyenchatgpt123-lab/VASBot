from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.utils.auth import get_current_user
from app.services.system_busy_service import get_status

router = APIRouter(prefix="/system", tags=["System"])


class SystemStatusResponse(BaseModel):
    busy: bool = False
    job: Optional[str] = None
    message: Optional[str] = None
    started_at: Optional[datetime] = None


@router.get("/status", response_model=SystemStatusResponse)
def system_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return SystemStatusResponse(**get_status(db))
