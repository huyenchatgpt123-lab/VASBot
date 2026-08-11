from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.timetable import (
    ClassRoom,
    TimetableSlot,
    SubstituteAssignment,
    session_for_period,
    period_label,
)
from app.models.user import User
from app.repositories.campus_repository import CampusRepository
from app.repositories.timetable_repository import TimetableRepository
from app.utils.name_matcher import resolve_assignee_among, CONFIDENCE_NONE
from app.utils.timetable_excel_import import parse_timetable_excel


class TimetableService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TimetableRepository(db)
        self.campus_repo = CampusRepository(db)

    def _format_slot(self, slot: TimetableSlot) -> dict:
        teacher = slot.teacher
        room = slot.class_room
        campus = slot.campus
        return {
            "id": slot.id,
            "teacher_id": slot.teacher_id,
            "teacher_name": teacher.name if teacher else None,
            "teacher_code": teacher.teacher_code if teacher else None,
            "teacher_department": teacher.department if teacher else None,
            "class_id": slot.class_id,
            "class_name": room.name if room else None,
            "campus_id": slot.campus_id,
            "campus_code": campus.code if campus else None,
            "day_of_week": slot.day_of_week,
            "period": slot.period,
            "session": session_for_period(slot.period),
            "period_label": period_label(slot.period),
        }

    def _format_class(self, room: ClassRoom) -> dict:
        return {
            "id": room.id,
            "name": room.name,
            "grade": room.grade,
            "campus_id": room.campus_id,
            "campus_code": room.campus.code if room.campus else None,
        }

    def _format_assignment(self, item: SubstituteAssignment) -> dict:
        return {
            "id": item.id,
            "date": item.date,
            "period": item.period,
            "session": session_for_period(item.period),
            "period_label": period_label(item.period),
            "class_id": item.class_id,
            "class_name": item.class_room.name if item.class_room else None,
            "campus_id": item.campus_id,
            "campus_code": item.campus.code if item.campus else None,
            "absent_teacher_id": item.absent_teacher_id,
            "absent_teacher_name": item.absent_teacher.name if item.absent_teacher else None,
            "absent_teacher_department": (
                item.absent_teacher.department if item.absent_teacher else None
            ),
            "substitute_teacher_id": item.substitute_teacher_id,
            "substitute_teacher_name": (
                item.substitute_teacher.name if item.substitute_teacher else None
            ),
            "substitute_teacher_department": (
                item.substitute_teacher.department if item.substitute_teacher else None
            ),
            "status": item.status,
            "confirmed_at": item.confirmed_at,
            "confirmed_by_id": item.confirmed_by_id,
            "rejection_reason": item.rejection_reason,
            "cancel_reason": item.cancel_reason,
            "created_at": item.created_at,
        }

    # ---- classes ----

    def list_classes(self, campus_id: Optional[int] = None) -> List[dict]:
        return [self._format_class(c) for c in self.repo.list_classes(campus_id)]

    def create_class(self, *, name: str, campus_id: int, grade: Optional[int] = None) -> dict:
        campus = self.campus_repo.get_by_id(campus_id)
        if not campus:
            raise ValueError("Cơ sở không tồn tại")
        clean = name.strip()
        if not clean:
            raise ValueError("Tên lớp không được để trống")
        if self.repo.get_class_by_name(clean, campus_id):
            raise ValueError(f"Lớp {clean} đã tồn tại tại cơ sở này")
        if grade is None:
            from app.utils.timetable_excel_import import _guess_grade
            grade = _guess_grade(clean)
        room = self.repo.create_class(name=clean, campus_id=campus_id, grade=grade)
        self.db.commit()
        self.db.refresh(room)
        room = self.repo.get_class(room.id)
        return self._format_class(room)

    # ---- slots ----

    def list_slots(
        self,
        *,
        campus_id: Optional[int] = None,
        teacher_id: Optional[int] = None,
        class_id: Optional[int] = None,
    ) -> List[dict]:
        return [
            self._format_slot(s)
            for s in self.repo.list_slots(
                campus_id=campus_id, teacher_id=teacher_id, class_id=class_id
            )
        ]

    def create_slot(
        self,
        *,
        teacher_id: int,
        class_id: int,
        campus_id: int,
        day_of_week: int,
        period: int,
    ) -> dict:
        self._validate_slot_fields(day_of_week, period)
        campus = self.campus_repo.get_by_id(campus_id)
        if not campus:
            raise ValueError("Cơ sở không tồn tại")
        teacher = self.db.query(User).filter(User.id == teacher_id).first()
        if not teacher:
            raise ValueError("Giáo viên không tồn tại")
        room = self.repo.get_class(class_id)
        if not room:
            raise ValueError("Lớp không tồn tại")
        if room.campus_id != campus_id:
            raise ValueError("Lớp không thuộc cơ sở đã chọn")

        if self.repo.find_teacher_conflict(teacher_id, day_of_week, period):
            raise ValueError("Giáo viên đã có tiết này")
        if self.repo.find_class_conflict(class_id, day_of_week, period):
            raise ValueError("Lớp đã có tiết này")

        slot = self.repo.create_slot(
            teacher_id=teacher_id,
            class_id=class_id,
            campus_id=campus_id,
            day_of_week=day_of_week,
            period=period,
        )
        if teacher.campus_id is None:
            teacher.campus_id = campus_id
        self.db.commit()
        slot = self.repo.get_slot(slot.id)
        return self._format_slot(slot)

    def update_slot(self, slot_id: int, **kwargs) -> dict:
        slot = self.repo.get_slot(slot_id)
        if not slot:
            raise ValueError("Tiết học không tồn tại")

        teacher_id = kwargs.get("teacher_id", slot.teacher_id)
        class_id = kwargs.get("class_id", slot.class_id)
        day_of_week = kwargs.get("day_of_week", slot.day_of_week)
        period = kwargs.get("period", slot.period)
        self._validate_slot_fields(day_of_week, period)

        if self.repo.find_teacher_conflict(teacher_id, day_of_week, period, exclude_id=slot_id):
            raise ValueError("Giáo viên đã có tiết này")
        if self.repo.find_class_conflict(class_id, day_of_week, period, exclude_id=slot_id):
            raise ValueError("Lớp đã có tiết này")

        room = self.repo.get_class(class_id)
        if not room:
            raise ValueError("Lớp không tồn tại")
        if room.campus_id != slot.campus_id:
            raise ValueError("Lớp không thuộc cùng cơ sở với tiết này")

        slot.teacher_id = teacher_id
        slot.class_id = class_id
        slot.day_of_week = day_of_week
        slot.period = period
        self.db.commit()
        slot = self.repo.get_slot(slot_id)
        return self._format_slot(slot)

    def delete_slot(self, slot_id: int) -> None:
        slot = self.repo.get_slot(slot_id)
        if not slot:
            raise ValueError("Tiết học không tồn tại")
        self.repo.delete_slot(slot)
        self.db.commit()

    @staticmethod
    def _validate_slot_fields(day_of_week: int, period: int) -> None:
        if day_of_week < 2 or day_of_week > 7:
            raise ValueError("Thứ phải từ 2 đến 7")
        if period < 1 or period > 8:
            raise ValueError("Tiết phải từ 1 đến 8")

    # ---- import ----

    def import_excel(self, content: bytes) -> dict:
        parsed, parse_errors = parse_timetable_excel(content)
        if not parsed and parse_errors:
            raise ValueError(parse_errors[0])

        campus_by_code = {c.code.upper(): c for c in self.campus_repo.get_all()}
        users = self.repo.list_users_for_match()
        code_map = {
            (u.teacher_code or "").upper(): u
            for u in users
            if u.teacher_code
        }

        unmatched: List[str] = []
        errors = list(parse_errors)
        ready: List[dict] = []
        matched_ids: set = set()

        for row in parsed:
            campus_code = (row.get("campus") or "").strip().upper()
            if not campus_code:
                errors.append(f"Dòng {row['row']}: thiếu cơ sở")
                continue

            campus = campus_by_code.get(campus_code)
            if not campus:
                errors.append(f"Dòng {row['row']}: cơ sở '{campus_code}' không tồn tại")
                continue

            teacher = None
            if row["teacher_code"] and row["teacher_code"] in code_map:
                teacher = code_map[row["teacher_code"]]
            elif row["name"]:
                match = resolve_assignee_among(users, row["name"])
                if match.user_id and match.confidence != CONFIDENCE_NONE:
                    teacher = next((u for u in users if u.id == match.user_id), None)

            if not teacher:
                label = row["teacher_code"] or row["name"] or f"dòng {row['row']}"
                if label not in unmatched:
                    unmatched.append(label)
                errors.append(f"Dòng {row['row']}: không khớp giáo viên '{label}'")
                continue

            matched_ids.add(teacher.id)
            ready.append({**row, "teacher_id": teacher.id, "campus_id": campus.id, "campus_code": campus.code})

        if not ready:
            return {
                "campuses": [],
                "slots_created": 0,
                "slots_updated": 0,
                "classes_created": 0,
                "teachers_matched": 0,
                "teachers_unmatched": unmatched,
                "errors": errors[:50],
                "message": "Không import được tiết nào — kiểm tra mã GV / tên / cơ sở",
            }

        classes_created = 0
        class_cache: dict = {}
        created = 0
        updated = 0
        campuses_affected: set = set()

        for row in ready:
            campus_id = row["campus_id"]
            campuses_affected.add(row["campus_code"])
            class_key = (campus_id, row["class_name"])
            if class_key not in class_cache:
                room, is_new = self.repo.get_or_create_class(
                    name=row["class_name"],
                    campus_id=campus_id,
                    grade=row.get("grade"),
                )
                class_cache[class_key] = room
                if is_new:
                    classes_created += 1
            room = class_cache[class_key]

            slot, is_new, is_updated = self.repo.upsert_slot(
                teacher_id=row["teacher_id"],
                class_id=room.id,
                campus_id=campus_id,
                day_of_week=row["day"],
                period=row["period"],
            )

            if slot is None:
                errors.append(
                    f"Dòng {row['row']}: xung đột tiết Thứ {row['day']} tiết {row['period']} "
                    f"(GV và lớp đã có tiết khác nhau)"
                )
                continue

            if is_new:
                created += 1
            elif is_updated:
                updated += 1

            teacher = next((u for u in users if u.id == row["teacher_id"]), None)
            if teacher and teacher.campus_id is None:
                teacher.campus_id = campus_id

        self.db.commit()
        campus_list = sorted(campuses_affected)
        campus_label = ", ".join(campus_list) if campus_list else "—"
        parts = []
        if created:
            parts.append(f"{created} tiết mới")
        if updated:
            parts.append(f"{updated} tiết cập nhật")
        summary = " và ".join(parts) if parts else "0 tiết"
        return {
            "campuses": campus_list,
            "slots_created": created,
            "slots_updated": updated,
            "classes_created": classes_created,
            "teachers_matched": len(matched_ids),
            "teachers_unmatched": unmatched,
            "errors": errors[:50],
            "message": (
                f"Đã import {summary} ({campus_label})"
                + (f" — tạo mới {classes_created} lớp" if classes_created else "")
            ),
        }

    # ---- my substitutes / my timetable ----

    def list_my_substitutes(
        self,
        user_id: int,
        *,
        from_today: bool = True,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> dict:
        start = from_date
        if start is None and from_today:
            start = date.today()
        items = self.repo.list_mine(user_id, from_date=start, to_date=to_date)
        formatted = [self._format_assignment(i) for i in items]
        return {"items": formatted, "count": len(formatted)}

    def count_my_substitutes(self, user_id: int) -> int:
        return self.repo.count_mine(user_id, from_date=date.today())

    def my_timetable_summary(self, user_id: int) -> dict:
        slot_count = self.repo.count_slots_for_teacher(user_id)
        pending_count = self.repo.count_mine_pending(user_id, from_date=date.today())
        any_subs = len(self.repo.list_mine(user_id, from_date=date.today())) > 0
        return {
            "has_timetable": slot_count > 0,
            "slot_count": slot_count,
            "substitute_count": pending_count,
            "has_upcoming_substitutes": any_subs,
        }

    def list_my_timetable(self, user_id: int) -> List[dict]:
        return self.list_slots(teacher_id=user_id)
