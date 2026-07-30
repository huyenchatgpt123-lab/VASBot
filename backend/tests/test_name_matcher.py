"""
Kiểm tra logic gán người nhận cho công việc trích từ kế hoạch.

Chạy: python -m tests.test_name_matcher  (từ thư mục backend)
Hoặc: pytest tests/test_name_matcher.py
"""
import os
import sys
from dataclasses import dataclass
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.name_matcher import (  # noqa: E402
    CONFIDENCE_AMBIGUOUS,
    CONFIDENCE_DEPARTMENT,
    CONFIDENCE_EXACT,
    CONFIDENCE_LAST_NAME,
    CONFIDENCE_NICKNAME,
    CONFIDENCE_NONE,
    fold_name,
    normalize_assignee_name,
    resolve_assignee_among as resolve_assignee,
)


@dataclass
class FakeUser:
    id: int
    name: str
    nickname: Optional[str] = None
    department: Optional[str] = None


HAI = FakeUser(1, "Nguyễn Văn Hải", nickname="Hải VP", department="Văn phòng")
HAI_TOAN = FakeUser(2, "Trần Thanh Hải", nickname="Hải Toán", department="Toán")
HUONG = FakeUser(3, "Lê Thị Hương", nickname="Hương", department="Văn")
DUC = FakeUser(4, "Phạm Minh Đức", department="Tin")

ONE_HAI: List[FakeUser] = [HAI, HUONG, DUC]
TWO_HAI: List[FakeUser] = [HAI, HAI_TOAN, HUONG, DUC]


def test_normalize_strips_honorifics_and_roles():
    assert normalize_assignee_name("Thầy Nguyễn Văn Hải") == "nguyễn văn hải"
    assert normalize_assignee_name("Cô Lê Thị Hương (Tổ Văn)") == "lê thị hương"
    assert normalize_assignee_name("TS. Nguyễn Văn Hải - Tổ trưởng") == "nguyễn văn hải"
    assert normalize_assignee_name("Thầy TS. Hải") == "hải"
    assert normalize_assignee_name("  ") == ""


def test_fold_removes_diacritics():
    assert fold_name("Nguyễn Văn Hải") == "nguyen van hai"
    assert fold_name("Phạm Minh Đức") == "pham minh duc"
    assert fold_name("Thay Hai") == "hai"


def test_full_name_matches_exactly():
    match = resolve_assignee(ONE_HAI, "Thầy Nguyễn Văn Hải")
    assert (match.user_id, match.confidence) == (HAI.id, CONFIDENCE_EXACT)


def test_full_name_without_diacritics_still_matches():
    match = resolve_assignee(ONE_HAI, "Nguyen Van Hai")
    assert (match.user_id, match.confidence) == (HAI.id, CONFIDENCE_EXACT)


def test_short_name_matches_when_unique():
    match = resolve_assignee(ONE_HAI, "thầy Hải")
    assert (match.user_id, match.confidence) == (HAI.id, CONFIDENCE_LAST_NAME)


def test_short_name_is_ambiguous_when_two_people_share_it():
    match = resolve_assignee(TWO_HAI, "thầy Hải")
    assert match.user_id is None
    assert match.confidence == CONFIDENCE_AMBIGUOUS
    assert set(match.candidate_ids) == {HAI.id, HAI_TOAN.id}


def test_document_department_breaks_the_tie():
    match = resolve_assignee(TWO_HAI, "thầy Hải", department="Toán")
    assert (match.user_id, match.confidence) == (HAI_TOAN.id, CONFIDENCE_DEPARTMENT)


def test_department_outside_candidates_does_not_force_a_guess():
    match = resolve_assignee(TWO_HAI, "thầy Hải", department="Tin")
    assert match.user_id is None
    assert match.confidence == CONFIDENCE_AMBIGUOUS


def test_nickname_matches():
    match = resolve_assignee(TWO_HAI, "Hải Toán")
    assert match.user_id == HAI_TOAN.id


def test_single_word_nickname_is_reported_as_nickname():
    match = resolve_assignee(ONE_HAI, "cô Hương")
    assert (match.user_id, match.confidence) == (HUONG.id, CONFIDENCE_NICKNAME)


def test_unknown_name_stays_unassigned():
    match = resolve_assignee(ONE_HAI, "Thầy Bình")
    assert (match.user_id, match.confidence) == (None, CONFIDENCE_NONE)


def test_empty_name_stays_unassigned():
    assert resolve_assignee(ONE_HAI, "").confidence == CONFIDENCE_NONE


def _main() -> int:
    failed = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"PASS {name}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {name}: {exc or 'assertion failed'}")
    print(f"\n{'FAILED' if failed else 'OK'} - {failed} error(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_main())
