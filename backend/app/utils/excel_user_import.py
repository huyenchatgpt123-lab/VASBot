import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


FIELD_ALIASES: Dict[str, List[str]] = {
    "name": ["ho ten", "hoten", "ten", "name", "họ tên"],
    "email": ["email", "e-mail"],
    "password": ["mat khau", "matkhau", "password", "mk", "mật khẩu"],
    "role": ["vai tro", "vaitro", "role", "vai trò"],
    "department": ["phong ban", "phongban", "department", "phòng ban"],
    "nickname": ["biet danh", "bietdanh", "nickname", "biệt danh"],
    "position": ["chuc vu", "chucvu", "position", "chức vụ"],
    "teacher_code": ["ma gv", "magv", "ma giao vien", "teacher code", "teacher_code", "mã gv"],
    "campus": ["co so", "coso", "campus", "cơ sở"],
}

DEFAULT_COLUMN_INDEX = {
    "name": 0,
    "email": 1,
    "password": 2,
    "role": 3,
    "department": 4,
    "nickname": 5,
    "position": 6,
    "teacher_code": 7,
    "campus": 8,
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


def _optional_str(value: Any) -> Optional[str]:
    text = _cell_to_str(value)
    return text if text else None


def split_position_names(raw: Optional[str]) -> List[str]:
    """Split 'BGH, Tổ trưởng' / 'BGH; Tổ trưởng' / 'BGH / Tổ trưởng' into names."""
    if not raw:
        return []
    parts = re.split(r"[,;/|]+", str(raw))
    return [p.strip() for p in parts if p.strip()]


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

    for field, idx in DEFAULT_COLUMN_INDEX.items():
        if field not in column_map:
            column_map[field] = idx

    return column_map


def parse_user_row(row: Tuple[Any, ...], column_map: Dict[str, int]) -> Dict[str, Any]:
    def get(field: str) -> Any:
        idx = column_map.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    role = _cell_to_str(get("role")).lower() or "user"
    if role not in ("admin", "user"):
        role = "user"

    position_raw = _optional_str(get("position"))
    return {
        "name": _cell_to_str(get("name")),
        "email": _cell_to_str(get("email")),
        "password": _cell_to_str(get("password")),
        "role": role,
        "department": _optional_str(get("department")),
        "nickname": _cell_to_str(get("nickname")),
        "position": position_raw,
        "positions": split_position_names(position_raw),
        "teacher_code": (_optional_str(get("teacher_code")) or "").upper() or None,
        "campus": (_optional_str(get("campus")) or "").upper() or None,
    }


def is_empty_row(row: Tuple[Any, ...]) -> bool:
    if not row:
        return True
    return all(cell is None or _cell_to_str(cell) == "" for cell in row)
