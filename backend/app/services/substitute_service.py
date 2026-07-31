"""Substitute assignment: suggestions + batch assign.

Ranking (hard filter first: free at that slot + same campus as class):
  1. Same department (tổ)
  2. Other department
Within a tier: fewer lessons that day, then fewer substitutes that week.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.timetable import period_label, session_for_period
from app.models.user import User, UserRole
from app.repositories.timetable_repository import TimetableRepository
from app.services.timetable_service import TimetableService


def date_to_day_of_week(d: date) -> Optional[int]:
    """Mon=2 … Sat=7; Sunday → None."""
    if d.weekday() == 6:
        return None
    return d.weekday() + 2


def week_bounds(d: date) -> tuple[date, date]:
    """Monday–Saturday containing d (skip Sunday-only weeks)."""
    monday = d - timedelta(days=d.weekday())
    saturday = monday + timedelta(days=5)
    return monday, saturday


class SubstituteService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = TimetableRepository(db)
        self.tt = TimetableService(db)

    def list_board(
        self,
        *,
        from_date: date,
        to_date: date,
        campus_id: Optional[int] = None,
    ) -> List[dict]:
        items = self.repo.list_assignments(
            from_date=from_date, to_date=to_date, campus_id=campus_id
        )
        return [self.tt._format_assignment(i) for i in items]

    def absent_periods(
        self,
        *,
        absent_teacher_id: int,
        dates: List[date],
    ) -> List[dict]:
        """Expand dates → concrete (date, period, class) rows from weekly TKB."""
        teacher = self.db.query(User).filter(User.id == absent_teacher_id).first()
        if not teacher:
            raise ValueError("Giáo viên nghỉ không tồn tại")

        unique_dates = sorted(set(dates))
        dow_map: dict[int, List[date]] = {}
        for d in unique_dates:
            dow = date_to_day_of_week(d)
            if dow is None:
                continue
            dow_map.setdefault(dow, []).append(d)

        slots = self.repo.list_slots_for_teacher_days(
            absent_teacher_id, list(dow_map.keys())
        )
        by_dow: dict[int, list] = {}
        for s in slots:
            by_dow.setdefault(s.day_of_week, []).append(s)

        rows: List[dict] = []
        for dow, date_list in dow_map.items():
            for d in date_list:
                for s in by_dow.get(dow, []):
                    # Skip if already assigned
                    existing = self.repo.find_class_sub_conflict(s.class_id, d, s.period)
                    rows.append({
                        "date": d.isoformat(),
                        "day_of_week": dow,
                        "period": s.period,
                        "session": session_for_period(s.period),
                        "period_label": period_label(s.period),
                        "class_id": s.class_id,
                        "class_name": s.class_room.name if s.class_room else None,
                        "campus_id": s.campus_id,
                        "campus_code": s.campus.code if s.campus else None,
                        "already_assigned": existing is not None,
                        "existing_assignment_id": existing.id if existing else None,
                        "existing_substitute_name": (
                            existing.substitute_teacher.name
                            if existing and existing.substitute_teacher
                            else None
                        ),
                    })
        rows.sort(key=lambda r: (r["date"], r["period"]))
        return rows

    def suggest(
        self,
        *,
        absent_teacher_id: int,
        on_date: date,
        period: int,
        class_id: int,
        campus_id: int,
        limit: int = 20,
        q: Optional[str] = None,
    ) -> List[dict]:
        if period < 1 or period > 8:
            raise ValueError("Tiết phải từ 1 đến 8")
        dow = date_to_day_of_week(on_date)
        if dow is None:
            raise ValueError("Chủ nhật không có tiết dạy")

        absent = self.db.query(User).filter(User.id == absent_teacher_id).first()
        if not absent:
            raise ValueError("Giáo viên nghỉ không tồn tại")

        room = self.repo.get_class(class_id)
        if not room:
            raise ValueError("Lớp không tồn tại")
        if room.campus_id != campus_id:
            raise ValueError("Lớp không thuộc cơ sở đã chọn")

        busy_tt = self.repo.teacher_busy_periods_on_dow(dow)
        busy_sub = self.repo.teacher_sub_busy_on_date(on_date)
        week_from, week_to = week_bounds(on_date)
        week_counts = self.repo.count_subs_in_range(week_from, week_to)
        query = (q or "").strip().lower()

        # Periods count that day = weekly TKB that DOW + subs already that date
        def periods_that_day(uid: int) -> int:
            return len(busy_tt.get(uid, set()) | busy_sub.get(uid, set()))

        candidates = (
            self.db.query(User)
            .filter(User.id != absent_teacher_id, User.role != UserRole.admin)
            .all()
        )
        scored: List[dict] = []

        for u in candidates:
            # Campus hard constraint: prefer users of this campus; also allow
            # campus_id NULL (unknown) but prefer matching campus.
            if u.campus_id is not None and u.campus_id != campus_id:
                continue

            busy_main = period in busy_tt.get(u.id, set())
            busy_as_sub = period in busy_sub.get(u.id, set())
            # Đã nhận dạy thay tiết này → không cho chọn lại
            if busy_as_sub:
                continue

            # Không tìm: chỉ gợi ý GV trống. Có tìm: gồm cả đang có tiết.
            if not query and busy_main:
                continue

            if query:
                hay = f"{u.name or ''} {u.department or ''} {u.teacher_code or ''}".lower()
                if query not in hay:
                    continue

            same_dept = bool(
                absent.department
                and u.department
                and absent.department == u.department
            )
            day_load = periods_that_day(u.id)
            week_subs = week_counts.get(u.id, 0)
            tier = 0 if same_dept else 1
            scored.append({
                "user_id": u.id,
                "name": u.name,
                "teacher_code": u.teacher_code,
                "department": u.department,
                "campus_id": u.campus_id,
                "same_department": same_dept,
                "tier_label": "Cùng tổ" if same_dept else "Tổ khác",
                "periods_that_day": day_load,
                "substitutes_this_week": week_subs,
                "is_busy": busy_main,
                "busy_reason": "Có tiết dạy" if busy_main else None,
                # Free first, then tier / load
                "_sort": (1 if busy_main else 0, tier, day_load, week_subs, u.name or ""),
            })

        scored.sort(key=lambda x: x["_sort"])
        for item in scored:
            item.pop("_sort", None)
        return scored[:limit]

    def assign_batch(
        self,
        *,
        items: List[dict],
        assigned_by_id: int,
    ) -> dict:
        """
        items: [{absent_teacher_id, substitute_teacher_id, class_id, campus_id, date, period}, ...]
        Substitute must be chosen per period (caller responsibility).
        """
        if not items:
            raise ValueError("Không có tiết nào để lưu")

        created = []
        errors = []

        # Track batch occupancy to avoid double-booking within same request
        taken_teacher: set = set()  # (sub_id, date, period)
        taken_class: set = set()  # (class_id, date, period)

        for idx, raw in enumerate(items):
            try:
                absent_id = int(raw["absent_teacher_id"])
                sub_id = int(raw["substitute_teacher_id"])
                class_id = int(raw["class_id"])
                campus_id = int(raw["campus_id"])
                period = int(raw["period"])
                on_date = raw["date"]
                if isinstance(on_date, str):
                    on_date = date.fromisoformat(on_date)
            except (KeyError, TypeError, ValueError):
                errors.append(f"Dòng {idx + 1}: dữ liệu không hợp lệ")
                continue

            if period < 1 or period > 8:
                errors.append(f"Dòng {idx + 1}: tiết không hợp lệ")
                continue
            if date_to_day_of_week(on_date) is None:
                errors.append(f"Dòng {idx + 1}: không xếp Chủ nhật")
                continue
            if absent_id == sub_id:
                errors.append(f"Dòng {idx + 1}: không thể tự dạy thay chính mình")
                continue

            key_t = (sub_id, on_date, period)
            key_c = (class_id, on_date, period)
            if key_t in taken_teacher:
                errors.append(f"Dòng {idx + 1}: giáo viên dạy thay bị trùng tiết trong batch")
                continue
            if key_c in taken_class:
                errors.append(f"Dòng {idx + 1}: lớp bị trùng tiết trong batch")
                continue

            # Cho phép xếp khi GV đang có tiết chính (cảnh báo ở UI); vẫn chặn nếu đã nhận dạy thay.
            if self.repo.find_sub_teacher_conflict(sub_id, on_date, period):
                errors.append(f"Dòng {idx + 1}: giáo viên đã nhận dạy thay tiết này")
                continue
            if self.repo.find_class_sub_conflict(class_id, on_date, period):
                errors.append(f"Dòng {idx + 1}: lớp đã có người dạy thay tiết này")
                continue

            room = self.repo.get_class(class_id)
            if not room or room.campus_id != campus_id:
                errors.append(f"Dòng {idx + 1}: lớp / cơ sở không khớp")
                continue

            sub = self.db.query(User).filter(User.id == sub_id).first()
            if not sub:
                errors.append(f"Dòng {idx + 1}: giáo viên dạy thay không tồn tại")
                continue
            if sub.campus_id is not None and sub.campus_id != campus_id:
                errors.append(f"Dòng {idx + 1}: giáo viên khác cơ sở")
                continue

            item = self.repo.create_assignment(
                absent_teacher_id=absent_id,
                substitute_teacher_id=sub_id,
                class_id=class_id,
                campus_id=campus_id,
                date=on_date,
                period=period,
                status="assigned",
                assigned_by_id=assigned_by_id,
            )
            taken_teacher.add(key_t)
            taken_class.add(key_c)
            created.append(item.id)

        self.db.commit()
        saved = []
        for aid in created:
            a = self.repo.get_assignment(aid)
            if a:
                saved.append(self.tt._format_assignment(a))

        return {
            "created": len(saved),
            "items": saved,
            "errors": errors,
            "message": f"Đã xếp {len(saved)} tiết dạy thay"
            + (f" ({len(errors)} lỗi)" if errors else ""),
        }

    def cancel(self, assignment_id: int) -> dict:
        item = self.repo.get_assignment(assignment_id)
        if not item:
            raise ValueError("Không tìm thấy lịch dạy thay")
        if item.status == "cancelled":
            return self.tt._format_assignment(item)
        item.status = "cancelled"
        self.db.commit()
        item = self.repo.get_assignment(assignment_id)
        return self.tt._format_assignment(item)
