import re
import unicodedata
from typing import TYPE_CHECKING, Any, List, NamedTuple, Optional, Sequence, Tuple

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

# Honorifics / titles that may prefix a name in a plan document.
# Over-stripping is safe because the same normalization runs on stored user
# names, and no Vietnamese family name collides with these words.
_HONORIFIC_SRC = (
    r"^(?:"
    r"thầy\s+giáo|cô\s+giáo"
    r"|thầy|cô|ông|bà|chị|anh"
    r"|pgs|gs|ths|th\.s|ts|bs|cn"
    r"|mr|mrs|ms|miss|dr|prof"
    r")\.?\s+"
)

# Role/title text trailing a name: "Nguyễn Văn Hải - Tổ trưởng"
_ROLE_SUFFIX_SRC = (
    r"\s*[-–—,;]\s*(?:"
    r"tổ\s*trưởng|tổ\s*phó|nhóm\s*trưởng|trưởng\s*(?:ban|đoàn|bộ\s*môn|phòng)"
    r"|phó\s*(?:ban|đoàn|hiệu\s*trưởng)|hiệu\s*trưởng|hiệu\s*phó|ht|pht|bgh"
    r"|giáo\s*viên|gv|gvcn|chủ\s*nhiệm|thư\s*ký|phụ\s*trách|hỗ\s*trợ|điều\s*hành"
    r")\b.*$"
)

_BRACKET_PATTERN = re.compile(r"[（(\[{][^）)\]}]*[）)\]}]")
_EDGE_PUNCT = " \t.,;:!?\"'`*•-–—_|"


def _strip_diacritics(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


# Folded twins so names typed without diacritics ("Thay Hai - To truong") are
# cleaned the same way; the sources hold only ASCII metachars plus Vietnamese letters.
_HONORIFIC_PATTERN = re.compile(_HONORIFIC_SRC, re.IGNORECASE)
_HONORIFIC_FOLDED = re.compile(_strip_diacritics(_HONORIFIC_SRC), re.IGNORECASE)
_ROLE_SUFFIX_PATTERN = re.compile(_ROLE_SUFFIX_SRC, re.IGNORECASE)
_ROLE_SUFFIX_FOLDED = re.compile(_strip_diacritics(_ROLE_SUFFIX_SRC), re.IGNORECASE)

# Confidence levels, most to least trustworthy.
CONFIDENCE_EXACT = "exact"
CONFIDENCE_NICKNAME = "nickname"
CONFIDENCE_GIVEN_NAME = "given_name"
CONFIDENCE_LAST_NAME = "last_name"
CONFIDENCE_DEPARTMENT = "department"
CONFIDENCE_AMBIGUOUS = "ambiguous"
CONFIDENCE_NONE = "none"


class AssigneeMatch(NamedTuple):
    user_id: Optional[int]
    confidence: str
    candidate_ids: Tuple[int, ...] = ()


def _clean(text: str, honorific: re.Pattern, role_suffix: re.Pattern) -> str:
    previous = None
    while previous != text:
        previous = text
        text = honorific.sub("", text).strip()
    text = role_suffix.sub("", text)
    return re.sub(r"\s+", " ", text).strip(_EDGE_PUNCT)


def normalize_assignee_name(name: str) -> str:
    """Strip honorifics, role suffixes, brackets and punctuation; lowercase. Keeps diacritics."""
    if not name:
        return ""
    text = _BRACKET_PATTERN.sub(" ", str(name))
    text = re.sub(r"\s+", " ", text).strip()
    return _clean(text, _HONORIFIC_PATTERN, _ROLE_SUFFIX_PATTERN).lower()


def fold_name(name: str) -> str:
    """Normalized name with Vietnamese diacritics removed, for tolerant comparison."""
    text = normalize_assignee_name(name)
    if not text:
        return ""
    return _clean(_strip_diacritics(text), _HONORIFIC_FOLDED, _ROLE_SUFFIX_FOLDED)


def _is_token_suffix(full: str, part: str) -> bool:
    """True when `part` is the tail of `full` on word boundaries ("thế đoan" of "nguyễn thị thế đoan")."""
    full_tokens = full.split(" ")
    part_tokens = part.split(" ")
    return (
        len(part_tokens) < len(full_tokens)
        and full_tokens[-len(part_tokens):] == part_tokens
    )


def _dedupe(users: Sequence[Any]) -> List[Any]:
    seen = set()
    result: List[Any] = []
    for user in users:
        if user.id in seen:
            continue
        seen.add(user.id)
        result.append(user)
    return result


def _pick(
    pool: Sequence[Any],
    confidence: str,
    department: Optional[str],
) -> Optional[AssigneeMatch]:
    """None → empty pool, keep trying the next tier. Otherwise a decision (possibly ambiguous)."""
    if not pool:
        return None

    candidate_ids = tuple(u.id for u in pool)
    if len(pool) == 1:
        return AssigneeMatch(pool[0].id, confidence, candidate_ids)

    if department:
        scoped = [u for u in pool if u.department and u.department == department]
        if len(scoped) == 1:
            return AssigneeMatch(scoped[0].id, CONFIDENCE_DEPARTMENT, candidate_ids)

    return AssigneeMatch(None, CONFIDENCE_AMBIGUOUS, candidate_ids)


def resolve_assignee_among(
    users: Sequence[Any],
    raw_name: str,
    *,
    department: Optional[str] = None,
) -> AssigneeMatch:
    """
    Resolve a name written in a plan document against a list of user accounts.

    Tiers, stopping at the first one that finds any candidate:
      1. Full name, diacritics included
      2. Full name, diacritics folded ("Nguyen Van Hai")
      3. Partial name: nickname plus anyone whose full name ends with what the
         document wrote — one syllable ("Hải") or several ("Thế Đoan").
         Pooling nickname and name tails together is what keeps two people
         called "Hải" ambiguous instead of silently picking whoever happens to
         own the nickname.

    Several candidates get narrowed by `department` when it is supplied; still
    undecided means no assignment rather than a guess.
    """
    normalized = normalize_assignee_name(raw_name)
    if not normalized:
        return AssigneeMatch(None, CONFIDENCE_NONE)

    folded = fold_name(raw_name)

    decided = _pick(
        [u for u in users if u.name and normalize_assignee_name(u.name) == normalized],
        CONFIDENCE_EXACT,
        department,
    )
    if decided:
        return decided

    decided = _pick(
        [u for u in users if u.name and fold_name(u.name) == folded],
        CONFIDENCE_EXACT,
        department,
    )
    if decided:
        return decided

    partial_pool = _dedupe([
        u
        for u in users
        if (u.nickname and fold_name(u.nickname) == folded)
        or (u.name and _is_token_suffix(fold_name(u.name), folded))
    ])
    tail_confidence = (
        CONFIDENCE_GIVEN_NAME if " " in folded else CONFIDENCE_LAST_NAME
    )
    decided = _pick(partial_pool, tail_confidence, department)
    if not decided:
        return AssigneeMatch(None, CONFIDENCE_NONE)
    if decided.confidence == tail_confidence:
        winner = next(u for u in partial_pool if u.id == decided.user_id)
        if winner.nickname and fold_name(winner.nickname) == folded:
            return decided._replace(confidence=CONFIDENCE_NICKNAME)
    return decided


def resolve_assignee(
    db: "Session",
    raw_name: str,
    *,
    department: Optional[str] = None,
) -> AssigneeMatch:
    from app.models.user import User

    return resolve_assignee_among(db.query(User).all(), raw_name, department=department)


def match_user_by_name(
    db: "Session",
    raw_name: str,
    *,
    department: Optional[str] = None,
) -> Optional[int]:
    return resolve_assignee(db, raw_name, department=department).user_id
