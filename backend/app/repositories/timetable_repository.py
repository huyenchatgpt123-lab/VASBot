from datetime import date
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.timetable import (
    ClassRoom,
    TimetableSlot,
    SubstituteAssignment,
    SUB_ACTIVE_STATUSES,
    SUB_BOARD_STATUSES,
    SUB_STATUS_PENDING,
)
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

    def delete_all_slots(self) -> int:
        count = self.db.query(TimetableSlot).delete(synchronize_session=False)
        self.db.flush()
        return count

    def delete_slots_for_teachers(self, teacher_ids: List[int]) -> int:
        if not teacher_ids:
            return 0
        count = (
            self.db.query(TimetableSlot)
            .filter(TimetableSlot.teacher_id.in_(teacher_ids))
            .delete(synchronize_session=False)
        )
        self.db.flush()
        return count

    def teacher_ids_having_slots(self, teacher_ids: set) -> set:
        if not teacher_ids:
            return set()
        rows = (
            self.db.query(TimetableSlot.teacher_id)
            .filter(TimetableSlot.teacher_id.in_(list(teacher_ids)))
            .distinct()
            .all()
        )
        return {r[0] for r in rows}

    def list_active_assignments_from(
        self, from_date: Optional[date] = None
    ) -> List[SubstituteAssignment]:
        q = (
            self.db.query(SubstituteAssignment)
            .options(
                joinedload(SubstituteAssignment.class_room),
                joinedload(SubstituteAssignment.campus),
                joinedload(SubstituteAssignment.absent_teacher),
                joinedload(SubstituteAssignment.substitute_teacher),
            )
            .filter(SubstituteAssignment.status.in_(SUB_ACTIVE_STATUSES))
        )
        if from_date is not None:
            q = q.filter(SubstituteAssignment.date >= from_date)
        return q.order_by(SubstituteAssignment.date, SubstituteAssignment.period).all()

    def get_import_meta(self):
        from app.models.timetable import TimetableImportMeta

        return (
            self.db.query(TimetableImportMeta)
            .filter(TimetableImportMeta.id == 1)
            .first()
        )

    def upsert_import_meta(self, *, last_imported_at, message: Optional[str] = None):
        from app.models.timetable import TimetableImportMeta

        meta = self.get_import_meta()
        if not meta:
            meta = TimetableImportMeta(id=1)
            self.db.add(meta)
        meta.last_imported_at = last_imported_at
        if message is not None:
            meta.last_import_message = message[:500]
        self.db.flush()
        return meta

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

    def upsert_slot(
        self,
        *,
        teacher_id: int,
        class_id: int,
        campus_id: int,
        day_of_week: int,
        period: int,
    ) -> tuple[Optional[TimetableSlot], bool, bool]:
        """Return (slot, created, updated). slot is None on unresolvable conflict."""
        teacher_slot = self.find_teacher_conflict(teacher_id, day_of_week, period)
        class_slot = self.find_class_conflict(class_id, day_of_week, period)

        if teacher_slot and class_slot and teacher_slot.id != class_slot.id:
            return None, False, False

        target = teacher_slot or class_slot
        if target:
            changed = False
            if target.teacher_id != teacher_id:
                target.teacher_id = teacher_id
                changed = True
            if target.class_id != class_id:
                target.class_id = class_id
                changed = True
            if target.campus_id != campus_id:
                target.campus_id = campus_id
                changed = True
            if changed:
                self.db.flush()
            return target, False, changed

        slot = self.create_slot(
            teacher_id=teacher_id,
            class_id=class_id,
            campus_id=campus_id,
            day_of_week=day_of_week,
            period=period,
        )
        return slot, True, False

    # ---- users lookup for import ----

    def get_user_by_teacher_code(self, code: str) -> Optional[User]:
        return self.db.query(User).filter(User.teacher_code == code).first()

    def list_users_for_match(self) -> List[User]:
        return (
            self.db.query(User)
            .options(joinedload(User.campus))
            .all()
        )

    # ---- substitute assignments ----

    def list_mine(
        self,
        teacher_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> List[SubstituteAssignment]:
        """Lịch liên quan tôi: dạy thay cho người khác HOẶC người khác dạy thay khi tôi nghỉ."""
        from sqlalchemy import or_

        q = (
            self.db.query(SubstituteAssignment)
            .options(
                joinedload(SubstituteAssignment.class_room),
                joinedload(SubstituteAssignment.campus),
                joinedload(SubstituteAssignment.absent_teacher),
                joinedload(SubstituteAssignment.substitute_teacher),
            )
            .filter(
                or_(
                    SubstituteAssignment.substitute_teacher_id == teacher_id,
                    SubstituteAssignment.absent_teacher_id == teacher_id,
                )
            )
        )
        if from_date:
            q = q.filter(SubstituteAssignment.date >= from_date)
        if to_date:
            q = q.filter(SubstituteAssignment.date <= to_date)
        return q.order_by(SubstituteAssignment.date, SubstituteAssignment.period).all()

    def count_mine_pending(
        self,
        teacher_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> int:
        q = self.db.query(func.count(SubstituteAssignment.id)).filter(
            SubstituteAssignment.substitute_teacher_id == teacher_id,
            SubstituteAssignment.status == SUB_STATUS_PENDING,
        )
        if from_date:
            q = q.filter(SubstituteAssignment.date >= from_date)
        if to_date:
            q = q.filter(SubstituteAssignment.date <= to_date)
        return int(q.scalar() or 0)

    def count_mine(
        self,
        teacher_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> int:
        """Badge: số tiết chờ xác nhận."""
        return self.count_mine_pending(teacher_id, from_date=from_date, to_date=to_date)

    def count_slots_for_teacher(self, teacher_id: int) -> int:
        return (
            self.db.query(func.count(TimetableSlot.id))
            .filter(TimetableSlot.teacher_id == teacher_id)
            .scalar()
            or 0
        )

    def list_assignments(
        self,
        *,
        from_date: date,
        to_date: date,
        campus_id: Optional[int] = None,
        department: Optional[str] = None,
    ) -> List[SubstituteAssignment]:
        from sqlalchemy import or_
        from sqlalchemy.orm import aliased

        q = (
            self.db.query(SubstituteAssignment)
            .options(
                joinedload(SubstituteAssignment.class_room),
                joinedload(SubstituteAssignment.campus),
                joinedload(SubstituteAssignment.absent_teacher),
                joinedload(SubstituteAssignment.substitute_teacher),
            )
            .filter(
                SubstituteAssignment.status.in_(SUB_BOARD_STATUSES),
                SubstituteAssignment.date >= from_date,
                SubstituteAssignment.date <= to_date,
            )
        )
        if campus_id:
            q = q.filter(SubstituteAssignment.campus_id == campus_id)
        if department:
            AbsentUser = aliased(User)
            SubUser = aliased(User)
            q = (
                q.join(AbsentUser, SubstituteAssignment.absent_teacher_id == AbsentUser.id)
                .join(SubUser, SubstituteAssignment.substitute_teacher_id == SubUser.id)
                .filter(
                    or_(
                        AbsentUser.department == department,
                        SubUser.department == department,
                    )
                )
            )
        return q.order_by(
            SubstituteAssignment.date,
            SubstituteAssignment.period,
            SubstituteAssignment.id,
        ).all()

    def get_assignment(self, assignment_id: int) -> Optional[SubstituteAssignment]:
        return (
            self.db.query(SubstituteAssignment)
            .options(
                joinedload(SubstituteAssignment.class_room),
                joinedload(SubstituteAssignment.campus),
                joinedload(SubstituteAssignment.absent_teacher),
                joinedload(SubstituteAssignment.substitute_teacher),
            )
            .filter(SubstituteAssignment.id == assignment_id)
            .first()
        )

    def create_assignment(self, **kwargs) -> SubstituteAssignment:
        item = SubstituteAssignment(**kwargs)
        self.db.add(item)
        self.db.flush()
        return item

    def list_slots_for_teacher_days(
        self, teacher_id: int, day_of_weeks: List[int]
    ) -> List[TimetableSlot]:
        if not day_of_weeks:
            return []
        return (
            self.db.query(TimetableSlot)
            .options(
                joinedload(TimetableSlot.class_room),
                joinedload(TimetableSlot.campus),
                joinedload(TimetableSlot.teacher),
            )
            .filter(
                TimetableSlot.teacher_id == teacher_id,
                TimetableSlot.day_of_week.in_(day_of_weeks),
            )
            .order_by(TimetableSlot.day_of_week, TimetableSlot.period)
            .all()
        )

    def teacher_busy_periods_on_dow(self, day_of_week: int) -> dict:
        """teacher_id -> set of periods from weekly timetable."""
        rows = (
            self.db.query(TimetableSlot.teacher_id, TimetableSlot.period)
            .filter(TimetableSlot.day_of_week == day_of_week)
            .all()
        )
        result: dict = {}
        for tid, period in rows:
            result.setdefault(tid, set()).add(period)
        return result

    def teacher_sub_busy_on_date(self, on_date: date) -> dict:
        """teacher_id -> set of periods already assigned as substitute that date."""
        rows = (
            self.db.query(
                SubstituteAssignment.substitute_teacher_id,
                SubstituteAssignment.period,
            )
            .filter(
                SubstituteAssignment.date == on_date,
                SubstituteAssignment.status.in_(SUB_ACTIVE_STATUSES),
                SubstituteAssignment.substitute_teacher_id.isnot(None),
            )
            .all()
        )
        result: dict = {}
        for tid, period in rows:
            if tid is None:
                continue
            result.setdefault(tid, set()).add(period)
        return result

    def count_subs_in_range(
        self, from_date: date, to_date: date
    ) -> dict:
        """teacher_id -> count of active substitute lessons in [from, to]."""
        rows = (
            self.db.query(
                SubstituteAssignment.substitute_teacher_id,
                func.count(SubstituteAssignment.id),
            )
            .filter(
                SubstituteAssignment.status.in_(SUB_ACTIVE_STATUSES),
                SubstituteAssignment.substitute_teacher_id.isnot(None),
                SubstituteAssignment.date >= from_date,
                SubstituteAssignment.date <= to_date,
            )
            .group_by(SubstituteAssignment.substitute_teacher_id)
            .all()
        )
        return {tid: cnt for tid, cnt in rows if tid is not None}

    def find_sub_teacher_conflict(
        self, teacher_id: int, on_date: date, period: int
    ) -> Optional[SubstituteAssignment]:
        return (
            self.db.query(SubstituteAssignment)
            .filter(
                SubstituteAssignment.substitute_teacher_id == teacher_id,
                SubstituteAssignment.date == on_date,
                SubstituteAssignment.period == period,
                SubstituteAssignment.status.in_(SUB_ACTIVE_STATUSES),
            )
            .first()
        )

    def find_class_sub_conflict(
        self, class_id: int, on_date: date, period: int
    ) -> Optional[SubstituteAssignment]:
        return (
            self.db.query(SubstituteAssignment)
            .filter(
                SubstituteAssignment.class_id == class_id,
                SubstituteAssignment.date == on_date,
                SubstituteAssignment.period == period,
                SubstituteAssignment.status.in_(SUB_ACTIVE_STATUSES),
            )
            .first()
        )