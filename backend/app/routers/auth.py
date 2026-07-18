from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import AuthService
from app.utils.auth import get_current_user
from app.utils.user_serializer import serialize_user
from app.models.user import User

router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    try:
        result = service.login(request.email, request.password)
        return TokenResponse(
            access_token=result["access_token"],
            token_type=result["token_type"],
            user=serialize_user(result["user"]),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
def register():
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Đăng ký công khai đã tắt. Vui lòng liên hệ Admin để được cấp tài khoản.",
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)
