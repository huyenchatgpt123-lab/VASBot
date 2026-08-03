import re
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User

_GV_PATTERN = re.compile(r"^GV(\d+)$", re.IGNORECASE)
_MAX_GV_NUM = 999


def _max_gv_number(db: Session) -> int:
    max_num = 0
    for (code,) in db.query(User.teacher_code).filter(User.teacher_code.isnot(None)).all():
        if not code:
            continue
        match = _GV_PATTERN.match(code.strip())
        if match:
            max_num = max(max_num, int(match.group(1)))
    return max_num


def format_teacher_code(num: int) -> str:
    if num < 1 or num > _MAX_GV_NUM:
        raise ValueError(f"Mã GV vượt giới hạn (GV001–GV{_MAX_GV_NUM:03d})")
    return f"GV{num:03d}"


def generate_next_teacher_code(db: Session) -> str:
    return format_teacher_code(_max_gv_number(db) + 1)


class TeacherCodeAllocator:
    """Allocate sequential GV### codes within a batch (import / bulk create)."""

    def __init__(self, db: Session):
        self.db = db
        self._next = _max_gv_number(db) + 1

    def allocate(self) -> str:
        code = format_teacher_code(self._next)
        self._next += 1
        return code

    def is_taken(self, code: str, exclude_id: Optional[int] = None) -> bool:
        q = self.db.query(User.id).filter(User.teacher_code == code.upper())
        if exclude_id is not None:
            q = q.filter(User.id != exclude_id)
        return q.first() is not None
