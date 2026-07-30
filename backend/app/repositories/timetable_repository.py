from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.timetable import ClassRoom, TimetableSlot, SubstituteAssignment
from app.models.user import User


class TimetableRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---- classes ----

    def list_classes(self, campus_id: Optional[int] = None) -> List[ClassRoom]:
        q = self.db.query(ClassRoom).options(joinedload(ClassRoom.campus))
        if campus_id:
            q = q.filter(ClassRoom.campus_id == campus_id)
        return q.order_by(ClassRoom.name).all()

    def get_class(self, class_id: int) -> Optional[ClassRoom]:
        return (
            self.db.query(ClassRoom)
            .options(joinedload(ClassRoom.campus))
            .filter(ClassRoom.id == class_id)
            .first()
        )

    def get_class_by_name(self, name: str, campus_id: int) -> Optional[ClassRoom]:
        return (
            self.db.query(ClassRoom)
            .filter(ClassRoom.name == name, ClassRoom.campus_id == campus_id)
            .first()
        )

    def create_class(self, *, name: str, campus_id: int, grade: Optional[int] = None) -> ClassRoom:
        room = ClassRoom(name=name, campus_id=campus_id, grade=grade)
        self.db.add(room)
        self.db.flush()
        return room

    def get_or_create_class(self, *, name: str, campus_id: int, grade: Optional[int] = None) -> tuple[ClassRoom, bool]:
        existing = self.get_class_by_name(name, campus_id)
        if existing:
            return existing, False
        return self.create_class(name=name, campus_id=campus_id, grade=grade), True

    # ---- slots ----

    def list_slots(
        self,
        *,
        campus_id: Optional[int] = None,
        teacher_id: Optional[int] = None,
        class_id: Optional[int] = None,
    ) -> List[TimetableSlot]:
        q = (
            self.db.query(TimetableSlot)
            .options(
                joinedload(TimetableSlot.teacher),
                joinedload(TimetableSlot.class_room),
                joinedload(TimetableSlot.campus),
            )
        )
        if campus_id:
            q = q.filter(TimetableSlot.campus_id == campus_id)
        if teacher_id:
            q = q.filter(TimetableSlot.teacher_id == teacher_id)
        if class_id:
            q = q.filter(TimetableSlot.class_id == class_id)
        return q.order_by(
            TimetableSlot.day_of_week,
            TimetableSlot.period,
            TimetableSlot.id,
        ).all()

    def get_slot(self, slot_id: int) -> Optional[TimetableSlot]:
        return (
            self.db.query(TimetableSlot)
            .options(
                joinedload(TimetableSlot.teacher),
                joinedload(TimetableSlot.class_room),
                joinedload(TimetableSlot.campus),
            )
            .filter(TimetableSlot.id == slot_id)
            .first()
        )

    def create_slot(self, **kwargs) -> TimetableSlot:
        slot = TimetableSlot(**kwargs)
        self.db.add(slot)
        self.db.flush()
        return slot

    def delete_slot(self, slot: TimetableSlot) -> None:
        self.db.delete(slot)

    def delete_slots_for_campus(self, campus_id: int) -> int:
        count = (
            self.db.query(TimetableSlot)
            .filter(TimetableSlot.campus_id == campus_id)
            .delete(synchronize_session=False)
        )
        self.db.flush()
        return count

    def find_teacher_conflict(
        self, teacher_id: int, day_of_week: int, period: int, exclude_id: Optional[int] = None
    ) -> Optional[TimetableSlot]:
        q = self.db.query(TimetableSlot).filter(
            TimetableSlot.teacher_id == teacher_id,
            TimetableSlot.day_of_week == day_of_week,
            TimetableSlot.period == period,
        )
        if exclude_id:
            q = q.filter(TimetableSlot.id != exclude_id)
        return q.first()

    def find_class_conflict(
        self, class_id: int, day_of_week: int, period: int, exclude_id: Optional[int] = None
    ) -> Optional[TimetableSlot]:
        q = self.db.query(TimetableSlot).filter(
            TimetableSlot.class_id == class_id,
            TimetableSlot.day_of_week == day_of_week,
            TimetableSlot.period == period,
        )
        if exclude_id:
            q = q.filter(TimetableSlot.id != exclude_id)
        return q.first()

    # ---- users lookup for import ----

    def get_user_by_teacher_code(self, code: str) -> Optional[User]:
        return self.db.query(User).filter(User.teacher_code == code).first()

    def list_users_for_match(self) -> List[User]:
        return self.db.query(User).all()

    # ---- substitute assignments ----

    def list_mine(self, teacher_id: int, from_date: Optional[date] = None) -> List[SubstituteAssignment]:
        q = (
            self.db.query(SubstituteAssignment)
            .options(
                joinedload(SubstituteAssignment.class_room),
                joinedload(SubstituteAssignment.campus),
                joinedload(SubstituteAssignment.absent_teacher),
                joinedload(SubstituteAssignment.substitute_teacher),
            )
            .filter(
                SubstituteAssignment.substitute_teacher_id == teacher_id,
                SubstituteAssignment.status == "assigned",
            )
        )
        if from_date:
            q = q.filter(SubstituteAssignment.date >= from_date)
        return q.order_by(SubstituteAssignment.date, SubstituteAssignment.period).all()

    def count_mine(self, teacher_id: int, from_date: Optional[date] = None) -> int:
        q = self.db.query(SubstituteAssignment).filter(
            SubstituteAssignment.substitute_teacher_id == teacher_id,
            SubstituteAssignment.status == "assigned",
        )
        if from_date:
            q = q.filter(SubstituteAssignment.date >= from_date)
        return q.count()
