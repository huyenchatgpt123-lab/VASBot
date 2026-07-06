from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.schemas.auth import UserCreate


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_all(self) -> List[User]:
        return self.db.query(User).order_by(User.created_at.desc()).all()

    def create(self, user_data: UserCreate, password_hash: str) -> User:
        user = User(
            name=user_data.name,
            email=user_data.email,
            password_hash=password_hash,
            role=UserRole(user_data.role),
            department=user_data.department,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user_id: int, **kwargs) -> Optional[User]:
        user = self.get_by_id(user_id)
        if not user:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(user, key):
                if key == "role":
                    setattr(user, key, UserRole(value))
                else:
                    setattr(user, key, value)
        self.db.commit()
        self.db.refresh(user)
        return user

    def count(self) -> int:
        return self.db.query(User).count()

    def delete(self, user_id: int) -> bool:
        user = self.get_by_id(user_id)
        if not user:
            return False
        self.db.delete(user)
        self.db.commit()
        return True
