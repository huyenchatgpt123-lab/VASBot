import unicodedata
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.position import Position


def _normalize(text: str) -> str:
    if not text:
        return ""
    text = text.strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


class PositionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[Position]:
        return self.db.query(Position).order_by(Position.sort_order, Position.name).all()

    def get_by_id(self, position_id: int) -> Optional[Position]:
        return self.db.query(Position).filter(Position.id == position_id).first()

    def get_by_name(self, name: str) -> Optional[Position]:
        if not name:
            return None
        normalized = _normalize(name)
        for pos in self.get_all():
            if _normalize(pos.name) == normalized:
                return pos
        return None

    def match_by_name(self, name: str) -> Optional[Position]:
        """Exact then fuzzy match; returns None if not found (no default)."""
        if not name:
            return None
        exact = self.get_by_name(name)
        if exact:
            return exact
        normalized = _normalize(name)
        for pos in self.get_all():
            if normalized in _normalize(pos.name) or _normalize(pos.name) in normalized:
                return pos
        return None

    def resolve_by_name(self, name: Optional[str]) -> Optional[Position]:
        if not name:
            return self.get_default()
        matched = self.match_by_name(name)
        return matched if matched else self.get_default()

    def resolve_many_by_names(self, names: List[str]) -> Tuple[List[Position], List[str]]:
        """Resolve multiple position names. Returns (positions, missing_names)."""
        positions: List[Position] = []
        missing: List[str] = []
        seen: set = set()
        for name in names:
            pos = self.match_by_name(name)
            if not pos:
                missing.append(name)
                continue
            if pos.id in seen:
                continue
            positions.append(pos)
            seen.add(pos.id)
        return positions, missing

    def get_default(self) -> Optional[Position]:
        return self.get_by_name("Giáo viên")

    def create(self, **kwargs) -> Position:
        pos = Position(**kwargs)
        self.db.add(pos)
        self.db.commit()
        self.db.refresh(pos)
        return pos

    def update(self, position_id: int, **kwargs) -> Optional[Position]:
        pos = self.get_by_id(position_id)
        if not pos:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(pos, key):
                setattr(pos, key, value)
        self.db.commit()
        self.db.refresh(pos)
        return pos

    def delete(self, position_id: int) -> bool:
        from app.models.user import User, user_positions

        pos = self.get_by_id(position_id)
        if not pos:
            return False
        in_use = (
            self.db.query(User)
            .filter(
                (User.position_id == position_id)
                | (User.id.in_(
                    self.db.query(user_positions.c.user_id).filter(
                        user_positions.c.position_id == position_id
                    )
                ))
            )
            .count()
        )
        if in_use > 0:
            raise ValueError(f"Không thể xóa: {in_use} người dùng đang dùng chức vụ này")
        self.db.delete(pos)
        self.db.commit()
        return True

    def count_users(self, position_id: int) -> int:
        from app.models.user import User, user_positions

        ids = {
            r[0]
            for r in self.db.query(user_positions.c.user_id)
            .filter(user_positions.c.position_id == position_id)
            .all()
        }
        for row in self.db.query(User.id).filter(User.position_id == position_id).all():
            ids.add(row[0])
        return len(ids)
