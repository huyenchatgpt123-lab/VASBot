from sqlalchemy.orm import Session

from app.repositories.user_repository import UserRepository
from app.utils.auth import hash_password, verify_password, create_access_token
from app.schemas.auth import UserCreate


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

    def change_password(
        self,
        user_id: int,
        *,
        current_password: str | None,
        new_password: str,
        confirm_password: str,
    ):
        if new_password != confirm_password:
            raise ValueError("Mật khẩu xác nhận không khớp")
        if len(new_password) < 8:
            raise ValueError("Mật khẩu mới phải có ít nhất 8 ký tự")

        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("Người dùng không tồn tại")

        if not user.must_change_password:
            if not current_password:
                raise ValueError("Vui lòng nhập mật khẩu hiện tại")
            if not verify_password(current_password, user.password_hash):
                raise ValueError("Mật khẩu hiện tại không đúng")

        if verify_password(new_password, user.password_hash):
            raise ValueError("Mật khẩu mới phải khác mật khẩu hiện tại")

        updated = self.user_repo.update(
            user_id,
            password_hash=hash_password(new_password),
            must_change_password=False,
        )
        return updated
