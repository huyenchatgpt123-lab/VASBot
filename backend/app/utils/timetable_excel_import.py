"""Parse flat-table timetable Excel.

Expected columns (header aliases accepted):
  Mã GV | Họ tên | Cơ sở | Thứ | Tiết | Lớp

Period is global 1–8 (1–5 morning, 6–8 afternoon).
"""
from __future__ import annotations

import re
import unicodedata
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import load_workbook


FIELD_ALIASES: Dict[str, List[str]] = {
    "teacher_code": ["ma gv", "magv", "ma giao vien", "teacher code", "teacher_code", "ma"],
    "name": ["ho ten", "hoten", "ten", "name", "ho va ten", "giao vien"],
    "campus": ["co so", "coso", "campus", "cơ sở"],
    "day": ["thu", "day", "day_of_week", "thu trong tuan"],
    "period": ["tiet", "period", "tiet hoc"],
    "class_name": ["lop", "class", "lop hoc", "ten lop"],
}


def _normalize_header(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _cell_to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value).strip()
    return str(value).strip()


def _guess_grade(class_name: str) -> Optional[int]:
    m = re.match(r"^(\d{1,2})", class_name.strip())
    if not m:
        return None
    grade = int(m.group(1))
    return grade if 1 <= grade <= 12 else None


def build_column_map(header_row: Tuple[Any, ...]) -> Dict[str, int]:
    normalized_aliases = {
        field: {_normalize_header(alias) for alias in aliases}
        for field, aliases in FIELD_ALIASES.items()
    }
    column_map: Dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        header = _normalize_header(cell)
        if not header:
            continue
        for field, aliases in normalized_aliases.items():
            if header in aliases and field not in column_map:
                column_map[field] = idx
                break
    return column_map


def parse_timetable_excel(content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Return (rows, errors). Each row: teacher_code, name, campus, day, period, class_name, grade."""
    errors: List[str] = []
    try:
        wb = load_workbook(filename=BytesIO(content), read_only=True, data_only=True)
    except Exception:
        return [], ["File Excel không hợp lệ"]

    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return [], ["File Excel trống"]

    column_map = build_column_map(all_rows[0])
    required = ["day", "period", "class_name"]
    missing = [f for f in required if f not in column_map]
    if missing:
        return [], [
            "Thiếu cột bắt buộc: "
            + ", ".join({"day": "Thứ", "period": "Tiết", "class_name": "Lớp"}[m] for m in missing)
            + ". Cần: Mã GV, Họ tên, Cơ sở, Thứ, Tiết, Lớp"
        ]
    if "teacher_code" not in column_map and "name" not in column_map:
        return [], ["Cần ít nhất một trong hai cột: Mã GV hoặc Họ tên"]

    rows: List[Dict[str, Any]] = []
    seen_teacher_slot: set = set()

    for i, row in enumerate(all_rows[1:], start=2):
        if not row or all(cell is None or _cell_to_str(cell) == "" for cell in row):
            continue

        def get(field: str) -> str:
            idx = column_map.get(field)
            if idx is None or idx >= len(row):
                return ""
            return _cell_to_str(row[idx])

        teacher_code = get("teacher_code").upper()
        name = get("name")
        # Strip honorifics lightly
        for prefix in ("Thầy ", "Cô ", "thầy ", "cô "):
            if name.startswith(prefix):
                name = name[len(prefix):].strip()
                break

        campus = get("campus").upper()
        day_raw = get("day")
        period_raw = get("period")
        class_name = get("class_name")

        try:
            day = int(float(day_raw)) if day_raw else 0
        except ValueError:
            errors.append(f"Dòng {i}: Thứ không hợp lệ '{day_raw}'")
            continue
        try:
            period = int(float(period_raw)) if period_raw else 0
        except ValueError:
            errors.append(f"Dòng {i}: Tiết không hợp lệ '{period_raw}'")
            continue

        if day < 2 or day > 7:
            errors.append(f"Dòng {i}: Thứ phải từ 2 đến 7 (got {day})")
            continue
        if period < 1 or period > 8:
            errors.append(f"Dòng {i}: Tiết phải từ 1 đến 8 (got {period})")
            continue
        if not class_name:
            errors.append(f"Dòng {i}: thiếu Lớp")
            continue
        if not teacher_code and not name:
            errors.append(f"Dòng {i}: thiếu Mã GV và Họ tên")
            continue

        key = (teacher_code or name.lower(), day, period)
        if key in seen_teacher_slot:
            errors.append(f"Dòng {i}: trùng tiết của cùng giáo viên (Thứ {day} tiết {period})")
            continue
        seen_teacher_slot.add(key)

        rows.append({
            "row": i,
            "teacher_code": teacher_code or None,
            "name": name or None,
            "campus": campus or None,
            "day": day,
            "period": period,
            "class_name": class_name,
            "grade": _guess_grade(class_name),
        })

    return rows, errors
