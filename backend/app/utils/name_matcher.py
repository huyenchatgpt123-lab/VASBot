import re
from typing import Optional, List

from sqlalchemy.orm import Session

from app.models.user import User

_PREFIX_PATTERN = re.compile(
    r"^(thầy|cô|thay|co|mr|mrs|ms|dr)\s+",
    re.IGNORECASE,
)


def normalize_assignee_name(name: str) -> str:
    """Normalize name for comparison: strip honorifics, whitespace, lowercase."""
    if not name:
        return ""
    text = name.strip()
    text = _PREFIX_PATTERN.sub("", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def match_user_by_name(db: Session, raw_name: str) -> Optional[int]:
    """
    Match assignee from document to user:
    1. Exact full name match (normalized, case-insensitive)
    2. If 0 or 2+ name matches → try unique nickname match
    """
    normalized = normalize_assignee_name(raw_name)
    if not normalized:
        return None

    all_users: List[User] = db.query(User).all()

    name_matches = [
        u for u in all_users
        if u.name and normalize_assignee_name(u.name) == normalized
    ]

    if len(name_matches) == 1:
        return name_matches[0].id

    nick_matches = [
        u for u in all_users
        if u.nickname and normalize_assignee_name(u.nickname) == normalized
    ]

    if len(nick_matches) == 1:
        return nick_matches[0].id

    return None
