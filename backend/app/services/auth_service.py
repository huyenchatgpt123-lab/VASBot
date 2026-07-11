from sqlalchemy.orm import Session

from app.repositories.user_repository import UserRepository
from app.utils.auth import hash_password, verify_password, create_access_token
from app.schemas.auth import UserCreate, RegisterRequest


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)

    def login(self, email: str, password: str) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise ValueError("Email hoặc mật khẩu không đúng")

        token = create_access_token(data={"sub": str(user.id)})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": user,
        }

    def register(self, data: RegisterRequest) -> dict:
        existing = self.user_repo.get_by_email(data.email)
        if existing:
            raise ValueError("Email đã được sử dụng")

        user_data = UserCreate(
            name=data.name,
            email=data.email,
            password=data.password,
            role="user",
        )
        user = self.user_repo.create(user_data, hash_password(data.password))
        token = create_access_token(data={"sub": str(user.id)})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": user,
        }

    def create_user(self, data: UserCreate, *, require_nickname: bool = True) -> dict:
        existing = self.user_repo.get_by_email(data.email)
        if existing:
            raise ValueError("Email đã được sử dụng")

        nickname = (data.nickname or "").strip()
        if require_nickname and not nickname:
            raise ValueError("Biệt danh không được để trống")
        if nickname and self.user_repo.nickname_exists(nickname):
            raise ValueError(f"Biệt danh '{nickname}' đã được sử dụng")

        if not nickname:
            data = data.model_copy(update={"nickname": None})

        user = self.user_repo.create(data, hash_password(data.password))
        return user
