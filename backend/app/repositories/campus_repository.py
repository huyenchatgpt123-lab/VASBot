from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.campus import Campus, DEFAULT_CAMPUSES


class CampusRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[Campus]:
        return self.db.query(Campus).order_by(Campus.code).all()

    def get_by_id(self, campus_id: int) -> Optional[Campus]:
        return self.db.query(Campus).filter(Campus.id == campus_id).first()

    def get_by_ids(self, campus_ids: List[int]) -> List[Campus]:
        if not campus_ids:
            return []
        return self.db.query(Campus).filter(Campus.id.in_(campus_ids)).all()

    def seed_defaults(self) -> None:
        for code in DEFAULT_CAMPUSES:
            if not self.db.query(Campus).filter(Campus.code == code).first():
                self.db.add(Campus(code=code, name=code))
        self.db.commit()
