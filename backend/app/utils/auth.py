from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

DOC_ACCESS_TYP = "doc_access"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_document_access_token(*, user_id: int, doc_id: int, purpose: str) -> str:
    """Short-lived, document-scoped token for opening preview/download in a new tab."""
    expire = datetime.utcnow() + timedelta(minutes=settings.DOC_ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {
            "sub": str(user_id),
            "doc_id": doc_id,
            "purpose": purpose,
            "typ": DOC_ACCESS_TYP,
            "exp": expire,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("typ") == DOC_ACCESS_TYP:
            raise credentials_exception
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    repo = UserRepository(db)
    user = repo.get_by_id(int(user_id))
    if user is None:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yêu cầu quyền Admin")
    return current_user


def get_current_user_from_token(token: Optional[str], db: Session) -> Optional[User]:
    """Session JWT only (rejects document access tokens)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("typ") == DOC_ACCESS_TYP:
            return None
        user_id = payload.get("sub")
        if user_id is None:
            return None
        repo = UserRepository(db)
        return repo.get_by_id(int(user_id))
    except JWTError:
        return None


def resolve_document_access_user(
    *,
    doc_id: int,
    purpose: str,
    access_token: Optional[str],
    credentials: Optional[HTTPAuthorizationCredentials],
    db: Session,
) -> User:
    """Auth via short-lived access_token query OR Bearer session JWT."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác thực",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if access_token:
        try:
            payload = jwt.decode(access_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        except JWTError:
            raise unauthorized
        if payload.get("typ") != DOC_ACCESS_TYP:
            raise unauthorized
        if int(payload.get("doc_id", -1)) != doc_id:
            raise unauthorized
        if payload.get("purpose") != purpose:
            raise unauthorized
        user_id = payload.get("sub")
        if user_id is None:
            raise unauthorized
        user = UserRepository(db).get_by_id(int(user_id))
        if not user:
            raise unauthorized
        return user

    if credentials:
        user = get_current_user_from_token(credentials.credentials, db)
        if user:
            return user

    raise unauthorized
