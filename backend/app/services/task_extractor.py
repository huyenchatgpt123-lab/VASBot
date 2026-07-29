import json
import re
import logging
from typing import List, Dict, Any, Optional, NamedTuple
from datetime import datetime, timezone, timedelta

from openai import OpenAI
from app.config import settings

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """Bạn là trợ lý trích xuất công việc từ tài liệu. Phân tích nội dung bên dưới và trích xuất TẤT CẢ công việc/nhiệm vụ được phân công.

QUY TẮC:
- Trích xuất mọi công việc có gán người thực hiện.
- Với mỗi công việc, lấy: tên công việc, người được giao, deadline (nếu có).
- Nếu tài liệu ghi RÕ giờ (VD: "8h30", "14:00") → deadline dạng "YYYY-MM-DDTHH:MM" (24h).
- Nếu chỉ có ngày/tuần/tháng KHÔNG có giờ → deadline dạng "YYYY-MM-DD".
- Nếu deadline ghi dạng "tuần 2 tháng 7" → chuyển thành ngày cụ thể (lấy ngày cuối tuần đó), không thêm giờ.
- Nếu deadline ghi "tháng 7/2026" → lấy ngày cuối tháng: 2026-07-31.
- Nếu không có deadline → để null.
- Tên người: giữ nguyên họ tên đầy đủ trong tài liệu.
- Nếu 1 người có nhiều công việc → tạo nhiều dòng riêng.
- QUAN TRỌNG: Nếu 1 công việc giao cho NHIỀU NGƯỜI (VD: "A, B, C phụ trách X") → TÁCH thành nhiều dòng riêng biệt, mỗi người 1 dòng với cùng tên công việc.
- Viết JSON ngắn gọn, tên công việc tóm tắt dưới 60 ký tự.

TRẢ VỀ JSON ARRAY (không giải thích gì thêm):
[{"title":"Tên CV","assignee_name":"Họ tên","deadline":"YYYY-MM-DDTHH:MM hoặc YYYY-MM-DD hoặc null"}]

Nếu không tìm thấy công việc nào → trả về: []"""

PLAN_EVENT_PROMPT = """Bạn đọc tài liệu kế hoạch/công tác và trích xuất NGÀY/GIỜ DIỄN RA và ĐỊA ĐIỂM từ các dòng có nhãn rõ.

QUY TẮC:
- Ưu tiên dòng "Thời gian:"; nếu không có thì dùng "Ngày:".
- date → ngày BẮT ĐẦU "YYYY-MM-DD". end_date → ngày KẾT THÚC nếu có khoảng (từ ... đến ..., 23/7-25/7); null nếu chỉ một ngày.
- time → "HH:MM" (24h) hoặc null. Ví dụ:
  • "09 giờ 00" → 09:00
  • "09 giờ 00 - 11 giờ 00" trong cùng ngày → time=09:00, end_date=null
  • "từ 23/7/2026 đến 25/7/2026" → date=2026-07-23, end_date=2026-07-25
  • "ngày 21 tháng 7 năm 2026" → date=2026-07-21, end_date=null
- location → lấy từ mục "Địa điểm:" / "2. Địa điểm:" — CHỈ các địa điểm trong mục đó.
  Dừng ngay trước mục tiếp theo (VD: "3. Tổ chức:", "Thời gian:", "Thành phần:").
  Nhiều địa điểm → nối bằng "; ". Không giữ số thứ tự mục, không giữ nhãn "Tổ chức".
  null nếu không có.
- Không dùng deadline công việc hay ngày upload.
- Không lấy mã trường VA1/VA3/EMC làm địa điểm trừ khi nằm trong dòng Địa điểm.

TRẢ VỀ JSON (không markdown):
{"date":"YYYY-MM-DD","end_date":"YYYY-MM-DD hoặc null","time":"HH:MM hoặc null","location":"chuỗi hoặc null"}

Nếu không tìm thấy ngày → {"date":null,"end_date":null,"time":null,"location":"... hoặc null"}"""

PLAN_TITLE_PROMPT = """Bạn đọc phần đầu tài liệu kế hoạch/công tác và trích xuất TIÊU ĐỀ CHÍNH THỨC của kế hoạch (dòng tiêu đề lớn, thường ở trang đầu).

QUY TẮC:
- Trả về đúng MỘT dòng tiêu đề như trong tài liệu (tiếng Việt, giữ số/tháng/năm học nếu có).
- Không thêm giải thích, dấu ngoặc, markdown hay JSON.
- Không dùng tên file.
- Tối đa 120 ký tự.
- Nếu không xác định được tiêu đề → trả về chuỗi rỗng."""

PLAN_TIMELINE_PROMPT = """Bạn đọc tài liệu kế hoạch (tiếng Việt hoặc tiếng Anh) và trích xuất LỊCH TRÌNH / AGENDA trong ngày.

QUY TẮC:
- Chỉ lấy các mục có khung giờ rõ. Hỗ trợ:
  • VI: 8h–9h, 08:00-09:30, 9 giờ 00 - 11 giờ 00
  • EN: 2:30 PM - 3:20 PM, 14:20 PM - 14:30 PM, 14:20-14:30
- start/end luôn trả về HH:MM 24 giờ (VD: 2:30 PM → 14:30; 14:20 PM → 14:20).
- title: CHỈ tiêu đề ngắn gọn (ưu tiên "Part N: …" / dòng đậm đầu), dưới 60 ký tự, giữ nghĩa.
  Không lấy đoạn mô tả dài, không lấy Person(s) In charge / người phụ trách.
- Bỏ dòng header bảng (Time, Key Activities, …). Bỏ mục không có giờ.
- Sắp xếp theo giờ tăng dần. Tối đa 30 mục.

TRẢ VỀ JSON ARRAY (không markdown):
[{"start":"14:20","end":"14:30","title":"Part 1: Welcome to Wonderland"}]

Nếu không có lịch trình theo giờ → []"""


PLAN_LOCATION_PROMPT = """Bạn đọc tài liệu và trích xuất CHỈ ĐỊA ĐIỂM tổ chức sự kiện.

QUY TẮC:
- Lấy từ mục "Địa điểm:" / "2. Địa điểm:" / "- Địa điểm:" — CHỈ nội dung trong mục đó.
- Dừng trước mục tiếp theo (Tổ chức, Thời gian, Thành phần, Nội dung, ...).
- Giữ nguyên một địa chỉ kể cả khi có dấu "-" giữa (VD: "Hội trường A - Trường Việt Anh 3").
- Nhiều địa điểm dạng danh sách → nối bằng "; ".
- Không lấy giờ, ngày, thứ trong tuần, mã trường VA1/VA3/EMC đứng một mình.
- Không giải thích. Không markdown.

TRẢ VỀ JSON:
{"location":"chuỗi địa điểm hoặc null"}"""


_EVENT_LINE_RE = re.compile(
    r"(?:Thời\s*gian|Ngày)\s*:\s*(.+)",
    re.IGNORECASE,
)
_LOCATION_HEADER_RE = re.compile(
    r"(?:^|\n)\s*(?:[-–—•*]\s*)?(?:\d+\.\s*)?(?:Địa\s*điểm|Dia\s*diem)\s*:\s*",
    re.IGNORECASE,
)
# Stop when next numbered section / labeled field begins (e.g. "3. Tổ chức:" / "- Tổ chức:")
# Require a newline so trailing school numbers like "Việt Anh 3." are not treated as sections.
_LOCATION_STOP_RE = re.compile(
    r"(?=\n\s*\d+\.\s+[^\n]{0,40}:)"
    r"|(?=\n\s*(?:[-–—•*]\s*)?(?:Tổ\s*chức|Thời\s*gian|Ngày|Thành\s*phần|Nội\s*dung|"
    r"Mục\s*đích|Yêu\s*cầu|Kinh\s*phí|Người\s*phụ\s*trách|Ghi\s*chú)\s*:)",
    re.IGNORECASE,
)
_LOCATION_BULLET_RE = re.compile(r"^[\-\u2013\u2014\u2022\*•]+\s*")
_LOCATION_NOISE_TIME_RE = re.compile(
    r"(?<!\d)\d{1,2}\s*(?:[:hH]|giờ)\s*\d{0,2}"
    r"|\b(?:Thứ|Thu)\s*(?:Hai|Ba|Tư|Năm|Sáu|Bảy|CN|Chu\s*nh[ậa]t)\b"
    r"|ngày\s*\d{1,2}\s*tháng\s*\d{1,2}\s*năm\s*\d{4}"
    r"|(?<!\d)\d{1,2}/\d{1,2}/\d{4}(?!\d)",
    re.IGNORECASE,
)
_LOCATION_LABEL_NOISE_RE = re.compile(
    r"(?:^|;\s*)(?:\d+\.\s*)?(?:Tổ\s*chức|Thời\s*gian|Ngày|Thành\s*phần|Nội\s*dung|"
    r"Mục\s*đích|Yêu\s*cầu|Kinh\s*phí|Người\s*phụ\s*trách|Ghi\s*chú)\s*:?\s*",
    re.IGNORECASE,
)
_LOCATION_CAMPUS_ONLY_RE = re.compile(r"^(?:VA\s*[13]|EMC)$", re.IGNORECASE)
_VN_DATE_SLASH_RE = re.compile(r"(?<!\d)(\d{1,2})/(\d{1,2})/(\d{4})(?!\d)")
_VN_DATE_WORDS_RE = re.compile(
    r"ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})",
    re.IGNORECASE,
)
_TIME_COLON_RE = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
_TIME_H_RE = re.compile(r"(?<!\d)(\d{1,2})\s*h\s*(\d{2})?(?!\w)", re.IGNORECASE)
_TIME_GIO_RE = re.compile(r"(?<!\d)(\d{1,2})\s*giờ\s*(\d{2})?(?!\w)", re.IGNORECASE)
_TIME_GIO_BARE_RE = re.compile(
    r"(?<!\d)(\d{1,2})\s*giờ(?:\s*(sáng|sang|chiều|chieu|trưa|tru|tối|toi))?",
    re.IGNORECASE,
)
_RANGE_INDICATOR_RE = re.compile(r"\b(?:đến|den|–|—)\b|(?<=\d)\s*-\s*(?=\d)", re.IGNORECASE)

# Timeline: VN "8h00 - 9h30: nội dung" / EN "14:20 PM - 14:30 PM Part 1: …"
_TIMELINE_SLOT_RE = re.compile(
    r"(?P<h1>\d{1,2})\s*(?:[:.hH]\s*(?P<m1>\d{2})|(?:\s*giờ\s*(?P<m1b>\d{2})?))?"
    r"(?:\s*(?:giờ|g)\s*)?"
    r"\s*(?P<p1>[AaPp][Mm])?"
    r"\s*(?:[-–—]|đến|den|to)\s*"
    r"(?P<h2>\d{1,2})\s*(?:[:.hH]\s*(?P<m2>\d{2})|(?:\s*giờ\s*(?P<m2b>\d{2})?))?"
    r"(?:\s*(?:giờ|g)\s*)?"
    r"\s*(?P<p2>[AaPp][Mm])?"
    r"\s*[:.\-–—]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
_TIMELINE_SINGLE_RE = re.compile(
    r"(?P<h1>\d{1,2})\s*(?:[:.hH]\s*(?P<m1>\d{2})|(?:\s*giờ\s*(?P<m1b>\d{2})?)|(?:\s*h\s*(?P<m1c>\d{2})?))?"
    r"\s*(?P<p1>[AaPp][Mm])?"
    r"\s*[:.\-–—]\s*(?P<title>.+)",
    re.IGNORECASE,
)
_TIMELINE_SECTION_RE = re.compile(
    r"(?:^|\n)\s*(?:[IVXLC]+\.\s*)?(?:\d+\.\s*)?(?:"
    r"Lịch\s*trình|Chương\s*trình(?:\s*làm\s*việc)?|Nội\s*dung\s*chương\s*trình|Tiến\s*trình|"
    r"Khung\s*giờ|Thời\s*khóa\s*biểu|"
    r"Activity\s+Day\s+Agenda|Agenda|Schedule|Programme|Program|Timeline|Run\s*of\s*show|"
    r"Working\s+schedule"
    r")\s*:?\s*",
    re.IGNORECASE,
)
# Stop only at high-level sections — do NOT stop on "Nội dung:" inside an agenda table.
_TIMELINE_SECTION_STOP_RE = re.compile(
    r"(?=\n\s*[IVXLC]+\.\s+[A-Za-zÀ-ỹ])"
    r"|(?=\n\s*\d+\.\s+(?:Tổ\s*chức|Địa\s*điểm|Thành\s*phần|Mục\s*đích|Yêu\s*cầu|"
    r"Kinh\s*phí|Ghi\s*chú|Phân\s*công|Nhiệm\s*vụ|Điều\s*kiện)\b)"
    r"|(?=\n\s*(?:[-–—•*]\s*)?(?:Tổ\s*chức|Địa\s*điểm)\s*:)",
    re.IGNORECASE,
)
_TIMELINE_TABLE_HEADER_RE = re.compile(
    r"^(?:time|key\s*activities|person\(s\)|persons?\s*in\s*charge|giờ|nội\s*dung|người\s*phụ\s*trách)\b",
    re.IGNORECASE,
)
_TIMELINE_PERSON_LINE_RE = re.compile(
    r"^(?:mrs?\.?|ms\.?|mr\.?|dr\.?)\s+\w+"
    r"|^(?:students?|teachers?|marketing\s+department|ban\s+giám\s+hiệu)\s*$"
    r"|^(?:mrs?\.?|ms\.?|mr\.?|dr\.?)\s+\w+(?:\s*,\s*(?:students?|teachers?|.+))?$",
    re.IGNORECASE,
)
_TIMELINE_TITLE_DATE_NOISE_RE = re.compile(
    r"ngày\s*\d{1,2}\s*tháng\s*\d{1,2}"
    r"|(?<!\d)\d{1,2}/\d{1,2}/\d{4}"
    r"|\b(?:Thứ|Thu)\s*(?:Hai|Ba|Tư|Năm|Sáu|Bảy|CN|Chủ\s*nhật)\b"
    r"|\bnăm\s*\d{4}\b",
    re.IGNORECASE,
)


class PlanEventRange(NamedTuple):
    start: datetime
    end: Optional[datetime] = None
    location: Optional[str] = None


def _hhmm(hour: int, minute: int) -> Optional[str]:
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _parse_timeline_minutes(h: Optional[str], *minute_groups: Optional[str]) -> tuple[int, int]:
    hour = int(h or 0)
    minute = 0
    for m in minute_groups:
        if m is not None and str(m).strip() != "":
            minute = int(m)
            break
    return hour, minute


def _timeline_to_24h(hour: int, minute: int, period: Optional[str]) -> Optional[str]:
    """Convert clock time to HH:MM 24h. Hour>=13 keeps value and ignores AM/PM."""
    if minute < 0 or minute > 59 or hour < 0 or hour > 23:
        return None
    if period and hour <= 12:
        p = period.strip().upper()
        if p == "AM":
            if hour == 12:
                hour = 0
        elif p == "PM":
            if hour != 12:
                hour += 12
    return _hhmm(hour, minute)


def _is_weak_timeline_title(title: str) -> bool:
    """Reject titles that are mostly event-date metadata, not an agenda activity."""
    t = (title or "").strip()
    if len(t) < 3:
        return True
    if re.match(r"^(?:thời\s*gian|ngày)\b", t, re.IGNORECASE):
        return True
    if _TIMELINE_TITLE_DATE_NOISE_RE.search(t):
        without = _TIMELINE_TITLE_DATE_NOISE_RE.sub(" ", t)
        without = re.sub(r"[,.;]", " ", without)
        without = re.sub(r"\s+", " ", without).strip(" .;,-")
        if len(without) < 10:
            return True
    return False


def _clean_timeline_title(raw: str) -> Optional[str]:
    text = raw.strip()
    text = re.sub(r"^[\-\u2013\u2014\u2022\*•]+\s*", "", text)
    # Drop person-in-charge column residue
    text = re.split(
        r"\b(?:Person\(s\)|Persons?)\s+In\s+charge\b|\bNgười\s*phụ\s*trách\b",
        text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    text = re.sub(r"\s+", " ", text).strip(" .;,-|")
    if not text or len(text) < 2:
        return None
    if _TIMELINE_TABLE_HEADER_RE.match(text):
        return None
    if _TIMELINE_PERSON_LINE_RE.match(text):
        return None
    if re.fullmatch(r"\d{1,2}\s*(?:[:.hH]?\d{0,2})\s*(?:[AaPp][Mm])?", text):
        return None
    if re.match(r"^(?:thời\s*gian|ngày)\s*:?\s*", text, re.IGNORECASE):
        return None

    # Prefer short activity heading: "Part 1: Welcome to Wonderland"
    part = re.match(
        r"^((?:Part|Phần)\s*\d+\s*:\s*.{2,70}?)(?:\s+[–—-]\s+|\.\s+|$)",
        text,
        re.IGNORECASE,
    )
    if part:
        text = part.group(1).strip()
    else:
        # Title - long description → keep left if short
        split = re.split(r"\s+[–—-]\s+", text, maxsplit=1)
        if len(split) == 2 and len(split[0]) <= 70 and len(split[1]) > 35:
            text = split[0].strip()
        elif ". " in text and len(text) > 70:
            text = text.split(". ", 1)[0].strip()

    text = text.strip(" .;,-")
    if not text or len(text) < 2:
        return None
    if _is_weak_timeline_title(text):
        return None
    return text[:60]


def _normalize_timeline_slots(slots: List[Dict[str, Any]]) -> List[Dict[str, Optional[str]]]:
    cleaned: List[Dict[str, Optional[str]]] = []
    seen = set()
    for slot in slots:
        start = slot.get("start")
        end = slot.get("end")
        title = _clean_timeline_title(str(slot.get("title") or ""))
        if not start or not title:
            continue
        # Validate HH:MM
        if not re.fullmatch(r"\d{2}:\d{2}", str(start)):
            continue
        if end and not re.fullmatch(r"\d{2}:\d{2}", str(end)):
            end = None
        key = (start, end or "", title.lower())
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({"start": str(start), "end": str(end) if end else None, "title": title})
    cleaned.sort(key=lambda s: (s["start"] or "", s["end"] or ""))
    return cleaned[:30]


def _timeline_search_window(text: str) -> tuple[str, bool]:
    """Return (search_text, found_agenda_section)."""
    section_match = _TIMELINE_SECTION_RE.search(text)
    if not section_match:
        return text[:10000], False

    rest = text[section_match.end() :]
    stop = _TIMELINE_SECTION_STOP_RE.search(rest)
    numbered = re.search(
        r"(?=\n\s*(?:[IVXLC]+\.\s+|[6-9]\.\s+|[1-9]\d+\.\s+)[A-Za-zÀ-ỹ])",
        rest,
    )
    end_idx = len(rest)
    if stop:
        end_idx = min(end_idx, stop.start())
    if numbered:
        end_idx = min(end_idx, numbered.start())
    window = rest[:end_idx] if end_idx < len(rest) else rest[:6000]
    return window, True


def _count_raw_timeline_ranges(text: str) -> int:
    return sum(1 for _ in _TIMELINE_SLOT_RE.finditer(text or ""))


def _timeline_regex_is_weak(slots: List[Dict[str, Optional[str]]], search_text: str) -> bool:
    """True → should also try AI (regex alone is insufficient / noisy)."""
    if not slots:
        return True
    if len(slots) == 1 and _is_weak_timeline_title(str(slots[0].get("title") or "")):
        return True
    if slots and all(_is_weak_timeline_title(str(s.get("title") or "")) for s in slots):
        return True
    raw_count = _count_raw_timeline_ranges(search_text)
    if raw_count >= 3 and len(slots) <= 1:
        return True
    if raw_count >= len(slots) + 2:
        return True
    return False


def _regex_extract_timeline(text: str) -> List[Dict[str, Optional[str]]]:
    """Extract timed agenda lines (VI/EN), prefer Agenda / Lịch trình section."""
    if not text or not text.strip():
        return []

    search_text, _has_section = _timeline_search_window(text)
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", search_text) if ln.strip()]
    slots: List[Dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if _TIMELINE_TABLE_HEADER_RE.match(line):
            i += 1
            continue

        m = _TIMELINE_SLOT_RE.search(line)
        if m:
            h1, m1 = _parse_timeline_minutes(m.group("h1"), m.group("m1"), m.group("m1b"))
            h2, m2 = _parse_timeline_minutes(m.group("h2"), m.group("m2"), m.group("m2b"))
            start = _timeline_to_24h(h1, m1, m.group("p1"))
            end = _timeline_to_24h(h2, m2, m.group("p2") or m.group("p1"))
            title_raw = (m.group("title") or "").strip()
            # PDF table: time alone on line → title on next non-person line
            look = i + 1
            while not title_raw and look < len(lines):
                nxt = lines[look]
                look += 1
                if _TIMELINE_TABLE_HEADER_RE.match(nxt) or _TIMELINE_PERSON_LINE_RE.match(nxt):
                    continue
                if _TIMELINE_SLOT_RE.search(nxt):
                    break
                title_raw = nxt
                i = look - 1
                break
            title = _clean_timeline_title(title_raw)
            if start and title:
                slots.append({"start": start, "end": end, "title": title})
            i += 1
            continue

        m2 = _TIMELINE_SINGLE_RE.search(line)
        if m2 and re.search(r"\d", line[:10]):
            if not re.search(r"\d\s*[hH:.]|giờ|[AaPp][Mm]", line[:24], re.IGNORECASE):
                i += 1
                continue
            # Skip numbered section headers like "2. Địa điểm: ..."
            if re.match(r"^\d+\.\s+\S", line):
                i += 1
                continue
            h1, minute = _parse_timeline_minutes(
                m2.group("h1"), m2.group("m1"), m2.group("m1b"), m2.group("m1c")
            )
            start = _timeline_to_24h(h1, minute, m2.group("p1"))
            title = _clean_timeline_title(m2.group("title") or "")
            if start and title:
                slots.append({"start": start, "end": None, "title": title})
        i += 1

    return _normalize_timeline_slots(slots)


def _parse_timeline_json(raw: Any) -> List[Dict[str, Optional[str]]]:
    if not isinstance(raw, list):
        return []
    slots = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        start = item.get("start")
        end = item.get("end")
        if end in ("", "null", None):
            end = None
        title = item.get("title")
        slots.append({"start": start, "end": end, "title": title})
    return _normalize_timeline_slots(slots)


def _parse_hhmm_tuple(value: Optional[str]) -> Optional[tuple[int, int]]:
    if not value or not re.fullmatch(r"\d{2}:\d{2}", str(value)):
        return None
    hour_s, minute_s = str(value).split(":")
    hour, minute = int(hour_s), int(minute_s)
    if hour > 23 or minute > 59:
        return None
    return hour, minute


def timeline_day_bounds(
    timeline: Optional[List[Dict[str, Any]]],
) -> Optional[tuple[str, Optional[str]]]:
    """
    1C: one slot with range → that range; many slots → first start + last end (or last start).
    """
    if not timeline:
        return None
    slots = [s for s in timeline if isinstance(s, dict) and s.get("start")]
    if not slots:
        return None
    start = str(slots[0]["start"])
    if len(slots) == 1:
        end_raw = slots[0].get("end")
        end = str(end_raw) if end_raw else None
    else:
        last = slots[-1]
        end_raw = last.get("end") or last.get("start")
        end = str(end_raw) if end_raw else None
        if end == start:
            end = str(last["end"]) if last.get("end") else end
    if not _parse_hhmm_tuple(start):
        return None
    if end and not _parse_hhmm_tuple(end):
        end = None
    return start, end


def has_explicit_clock_time(dt: Optional[datetime]) -> bool:
    """Date-only extractions are stored at 00:00 — treat that as 'no clock time' (4A)."""
    if not dt:
        return False
    return bool(dt.hour or dt.minute or dt.second)


def apply_timeline_time_fallback(
    starts_at: Optional[datetime],
    ends_at: Optional[datetime],
    timeline: Optional[List[Dict[str, Any]]],
) -> tuple[Optional[datetime], Optional[datetime]]:
    """
    If event has a date but no explicit clock time, fill start/end from timeline (1C, 4A).
    Multi-day end dates are preserved; only the start clock is filled.
    """
    if not starts_at or has_explicit_clock_time(starts_at):
        return starts_at, ends_at

    bounds = timeline_day_bounds(timeline)
    if not bounds:
        return starts_at, ends_at

    start_s, end_s = bounds
    parsed_start = _parse_hhmm_tuple(start_s)
    if not parsed_start:
        return starts_at, ends_at
    sh, sm = parsed_start
    new_start = starts_at.replace(hour=sh, minute=sm, second=0, microsecond=0)

    multi_day = ends_at is not None and ends_at.date() > starts_at.date()
    if multi_day:
        return new_start, ends_at

    if end_s:
        parsed_end = _parse_hhmm_tuple(end_s)
        if parsed_end:
            eh, em = parsed_end
            new_end = starts_at.replace(hour=eh, minute=em, second=0, microsecond=0)
            if new_end > new_start:
                return new_start, new_end
    return new_start, None


def _clean_location_item(raw: str) -> Optional[str]:
    text = raw.strip()
    text = _LOCATION_BULLET_RE.sub("", text)
    text = _LOCATION_LABEL_NOISE_RE.sub(" ", text)
    text = text.strip().rstrip(".;,")
    text = re.sub(r"\s+", " ", text)
    if not text or text.lower() == "null":
        return None
    # Drop leftover section headers accidentally captured
    if re.match(
        r"^\d+\.\s*(?:Tổ\s*chức|Thời\s*gian|Ngày|Thành\s*phần|Nội\s*dung)",
        text,
        re.IGNORECASE,
    ):
        return None
    if re.match(
        r"^(?:Tổ\s*chức|Thời\s*gian|Ngày|Thành\s*phần|Nội\s*dung)\s*:?\s*$",
        text,
        re.IGNORECASE,
    ):
        return None
    # Campus code alone is school affiliation, not a place
    if _LOCATION_CAMPUS_ONLY_RE.match(text):
        return None
    # Reject lines that are mostly datetime / weekday noise
    without_noise = _LOCATION_NOISE_TIME_RE.sub(" ", text)
    without_noise = re.sub(r"\s+", " ", without_noise).strip(" .;,-")
    if not without_noise or len(without_noise) < 3:
        return None
    # If heavy time/date noise but still has place words, strip the noise bits
    if _LOCATION_NOISE_TIME_RE.search(text) and len(without_noise) >= 8:
        text = without_noise
    return text[:200]


def _line_is_location_bullet(line: str) -> bool:
    return bool(re.match(r"^[-–—•*]\s+\S", line.strip()))


def _normalize_location(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    text = str(raw).strip()
    if not text or text.lower() == "null":
        return None

    # Cut off next numbered section / labeled field if still present
    stop = _LOCATION_STOP_RE.search(text)
    if stop:
        text = text[: stop.start()]

    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text) if ln.strip()]
    if not lines:
        return None

    # #2: Prefer first line when it already looks complete, unless following
    # lines are a real bullet list of places.
    first_clean = _clean_location_item(lines[0])
    following_bullets = [ln for ln in lines[1:] if _line_is_location_bullet(ln)]
    if first_clean and len(first_clean) >= 15 and not following_bullets:
        return first_clean[:300]

    # #5: Only split multi-location by newline bullet items — never by mid-line " - ".
    parts: List[str] = []
    if following_bullets or (lines and _line_is_location_bullet(lines[0]) and len(lines) > 1):
        candidate_lines = lines
        # If first line is header residue without bullet but rest are bullets, skip empty first
        if first_clean and not _line_is_location_bullet(lines[0]) and following_bullets:
            parts.append(first_clean)
            candidate_lines = lines[1:]
        for line in candidate_lines:
            piece = _clean_location_item(line)
            if piece and piece not in parts:
                parts.append(piece)
    else:
        if first_clean:
            parts = [first_clean]
        else:
            piece = _clean_location_item(text)
            if piece:
                parts = [piece]

    if not parts:
        return None

    joined = "; ".join(parts)
    return joined[:300] if len(joined) > 300 else joined


def _regex_extract_location(text: str) -> Optional[str]:
    """
    Extract only the Địa điểm block, stopping before the next section
    (e.g. "3. Tổ chức:"). Supports multi-line bullet lists.
    """
    for match in _LOCATION_HEADER_RE.finditer(text):
        rest = text[match.end() :]
        stop = _LOCATION_STOP_RE.search(rest)
        block = rest[: stop.start()] if stop else rest
        # Limit runaway capture if stop pattern misses
        block = block[:800]
        loc = _normalize_location(block)
        if loc:
            return loc
    return None


def _parse_location_json(raw: Any) -> Optional[str]:
    if isinstance(raw, dict):
        return _normalize_location(raw.get("location"))
    if isinstance(raw, str):
        return _normalize_location(raw)
    return None


def _date_tuple_to_datetime(day: int, month: int, year: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, 0)


def _find_all_vn_dates(text: str) -> List[tuple[int, int, int]]:
    dates: List[tuple[int, int, int]] = []
    seen = set()

    for match in _VN_DATE_WORDS_RE.finditer(text):
        item = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if item not in seen:
            seen.add(item)
            dates.append(item)

    for match in _VN_DATE_SLASH_RE.finditer(text):
        item = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if item not in seen:
            seen.add(item)
            dates.append(item)

    return dates


def _parse_vn_date(text: str) -> Optional[tuple[int, int, int]]:
    match = _VN_DATE_WORDS_RE.search(text)
    if match:
        return int(match.group(1)), int(match.group(2)), int(match.group(3))

    match = _VN_DATE_SLASH_RE.search(text)
    if match:
        return int(match.group(1)), int(match.group(2)), int(match.group(3))

    stripped = text.strip()
    try:
        dt = datetime.strptime(stripped[:10], "%Y-%m-%d")
        return dt.day, dt.month, dt.year
    except ValueError:
        return None


def _apply_day_period(hour: int, period: Optional[str]) -> int:
    if not period:
        return hour
    p = period.lower()
    if p in ("chiều", "chieu", "tối", "toi") and 1 <= hour <= 11:
        return hour + 12
    if p in ("sáng", "sang", "trưa", "tru") and hour == 12:
        return 0
    return hour


def _parse_vn_time(text: str) -> tuple[int, int]:
    colon = _TIME_COLON_RE.search(text)
    if colon:
        return int(colon.group(1)), int(colon.group(2))

    gio = _TIME_GIO_RE.search(text)
    if gio:
        return int(gio.group(1)), int(gio.group(2) or 0)

    h_match = _TIME_H_RE.search(text)
    if h_match:
        return int(h_match.group(1)), int(h_match.group(2) or 0)

    bare = _TIME_GIO_BARE_RE.search(text)
    if bare:
        hour = int(bare.group(1))
        hour = _apply_day_period(hour, bare.group(2))
        return hour, 0

    return 0, 0


def _parse_plan_event_line(line: str) -> Optional[PlanEventRange]:
    dates = _find_all_vn_dates(line)
    if not dates:
        return None

    hour, minute = _parse_vn_time(line)
    start_day, start_month, start_year = dates[0]
    start = _date_tuple_to_datetime(start_day, start_month, start_year, hour, minute)

    if len(dates) >= 2 and _RANGE_INDICATOR_RE.search(line):
        end_day, end_month, end_year = dates[-1]
        end = _date_tuple_to_datetime(end_day, end_month, end_year, 0, 0)
        if end.date() < start.date():
            start, end = end, start
        if end.date() > start.date():
            return PlanEventRange(start=start, end=end)
        return PlanEventRange(start=start, end=None)

    return PlanEventRange(start=start, end=None)


def _build_plan_event_datetime(date_part: str, time_part: Optional[str] = None) -> Optional[datetime]:
    date_parts = _parse_vn_date(date_part)
    if not date_parts:
        return None

    day, month, year = date_parts
    if time_part:
        hour, minute = _parse_vn_time(time_part)
    else:
        hour, minute = _parse_vn_time(date_part)

    try:
        return datetime(year, month, day, hour, minute, 0)
    except ValueError:
        return None


def _regex_extract_plan_event(text: str) -> Optional[PlanEventRange]:
    location = _regex_extract_location(text)
    for match in _EVENT_LINE_RE.finditer(text):
        line = match.group(1).strip().rstrip(".")
        if not line:
            continue
        result = _parse_plan_event_line(line)
        if result:
            return PlanEventRange(start=result.start, end=result.end, location=location)
    return None


def _parse_plan_event_json(raw: dict) -> Optional[PlanEventRange]:
    location = _normalize_location(raw.get("location"))
    date_val = raw.get("date")
    if not date_val or str(date_val).lower() == "null":
        return None

    time_val = raw.get("time")
    if time_val in (None, "", "null"):
        time_val = None
    start = _build_plan_event_datetime(str(date_val), str(time_val) if time_val else None)
    if not start:
        return None

    end_val = raw.get("end_date")
    if not end_val or str(end_val).lower() == "null":
        return PlanEventRange(start=start, end=None, location=location)

    end = _build_plan_event_datetime(str(end_val), None)
    if not end:
        return PlanEventRange(start=start, end=None, location=location)

    if end.date() < start.date():
        start, end = end, start
    if end.date() <= start.date():
        return PlanEventRange(start=start, end=None, location=location)
    return PlanEventRange(start=start, end=end, location=location)


def _try_fix_truncated_json(content: str) -> List[Dict]:
    """Try to recover tasks from truncated JSON response."""
    # Find all complete JSON objects in the content
    tasks = []
    pattern = r'\{[^{}]*"title"\s*:\s*"([^"]+)"[^{}]*"assignee_name"\s*:\s*"([^"]+)"[^{}]*"deadline"\s*:\s*("([^"]*)"|\s*null)[^{}]*\}'
    for match in re.finditer(pattern, content):
        title = match.group(1)
        assignee = match.group(2)
        deadline_val = match.group(4) if match.group(4) else None
        tasks.append({
            "title": title.strip(),
            "assignee_name": assignee.strip(),
            "deadline": deadline_val,
        })
    return tasks


class TaskExtractor:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def extract_from_text(self, text: str, context_date: Optional[str] = None) -> List[Dict[str, Any]]:
        vn_tz = timezone(timedelta(hours=7))
        now = datetime.now(vn_tz)
        date_context = context_date or now.strftime("%d/%m/%Y")

        user_content = f"Ngày hôm nay: {date_context}\n\nNỘI DUNG TÀI LIỆU:\n{text}"

        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": EXTRACT_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                temperature=0,
                max_tokens=8000,
            )

            content = response.choices[0].message.content or "[]"
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            try:
                tasks = json.loads(content)
            except json.JSONDecodeError:
                # JSON bị cắt → thử recover các object hoàn chỉnh
                logger.warning("GPT response truncated, attempting partial recovery")
                tasks = _try_fix_truncated_json(content)
                if tasks:
                    logger.info(f"Recovered {len(tasks)} tasks from truncated response")
                    return tasks
                return []

            if not isinstance(tasks, list):
                return []

            valid_tasks = []
            for task in tasks:
                if not task.get("title") or not task.get("assignee_name"):
                    continue
                valid_tasks.append({
                    "title": task["title"].strip(),
                    "assignee_name": task["assignee_name"].strip(),
                    "deadline": task.get("deadline"),
                })

            return valid_tasks

        except Exception as e:
            logger.error(f"Task extraction error: {e}")
            return []

    def extract_from_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        combined_text = "\n\n---\n\n".join(
            chunk.get("content", "") for chunk in chunks
        )

        # Nếu text quá dài, chia thành nhiều lần gọi
        if len(combined_text) > 12000:
            return self._extract_in_batches(chunks)

        return self.extract_from_text(combined_text)

    def _extract_in_batches(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Split chunks into batches and extract tasks from each."""
        all_tasks = []
        batch_size = 8
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            batch_text = "\n\n---\n\n".join(c.get("content", "") for c in batch)
            tasks = self.extract_from_text(batch_text)
            all_tasks.extend(tasks)

        # Deduplicate (same title + same assignee)
        seen = set()
        unique_tasks = []
        for t in all_tasks:
            key = (t["title"].lower(), t["assignee_name"].lower())
            if key not in seen:
                seen.add(key)
                unique_tasks.append(t)

        return unique_tasks

    def extract_plan_title(self, text: str) -> Optional[str]:
        snippet = text[:4000].strip()
        if not snippet:
            return None

        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": PLAN_TITLE_PROMPT},
                    {"role": "user", "content": f"PHẦN ĐẦU TÀI LIỆU:\n{snippet}"},
                ],
                temperature=0,
                max_tokens=150,
            )
            title = (response.choices[0].message.content or "").strip()
            if title.startswith("```"):
                title = title.split("\n", 1)[-1] if "\n" in title else title[3:]
                title = title.rstrip("`").strip()
            if not title:
                return None
            if len(title) > 120:
                title = title[:120].rstrip()
            return title
        except Exception as e:
            logger.warning(f"Plan title extraction error: {e}")
            return None

    def extract_plan_title_from_chunks(self, chunks: List[Dict[str, Any]]) -> Optional[str]:
        if not chunks:
            return None
        head = chunks[:6]
        combined = "\n".join(chunk.get("content", "") for chunk in head)
        return self.extract_plan_title(combined)

    def extract_plan_location(self, text: str) -> Optional[str]:
        """Regex first; AI location-only fallback when regex misses."""
        snippet = (text or "")[:12000].strip()
        if not snippet:
            return None

        regex_location = _regex_extract_location(snippet)
        if regex_location:
            return regex_location

        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": PLAN_LOCATION_PROMPT},
                    {"role": "user", "content": f"NỘI DUNG TÀI LIỆU:\n{snippet[:8000]}"},
                ],
                temperature=0,
                max_tokens=120,
            )
            content = (response.choices[0].message.content or "").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1] if "\n" in content else content[3:]
                content = content.rstrip("`").strip()
            raw = json.loads(content)
            return _parse_location_json(raw)
        except Exception as e:
            logger.warning(f"Plan location extraction error: {e}")
            return None

    def extract_plan_event(
        self,
        text: str,
        *,
        location: Optional[str] = None,
    ) -> Optional[PlanEventRange]:
        snippet = text[:12000].strip()
        if not snippet:
            return None

        # #6: always resolve location (regex → AI location-only), independent of date match
        if location is None:
            location = self.extract_plan_location(snippet)
        regex_result = _regex_extract_plan_event(snippet)
        if regex_result:
            return PlanEventRange(
                start=regex_result.start,
                end=regex_result.end,
                location=regex_result.location or location,
            )

        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": PLAN_EVENT_PROMPT},
                    {"role": "user", "content": f"NỘI DUNG TÀI LIỆU:\n{snippet}"},
                ],
                temperature=0,
                max_tokens=200,
            )
            content = (response.choices[0].message.content or "").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1] if "\n" in content else content[3:]
                content = content.rstrip("`").strip()
            raw = json.loads(content)
            if isinstance(raw, dict):
                parsed = _parse_plan_event_json(raw)
                if not parsed:
                    return None
                return PlanEventRange(
                    start=parsed.start,
                    end=parsed.end,
                    location=parsed.location or location,
                )
        except Exception as e:
            logger.warning(f"Plan event extraction error: {e}")
        return None

    def extract_plan_event_from_chunks(self, chunks: List[Dict[str, Any]]) -> Optional[PlanEventRange]:
        if not chunks:
            return None

        combined_all = "\n".join(chunk.get("content", "") for chunk in chunks)
        # #6: location always attempted on full text (once)
        location = self.extract_plan_location(combined_all)
        regex_result = _regex_extract_plan_event(combined_all)
        if regex_result:
            return PlanEventRange(
                start=regex_result.start,
                end=regex_result.end,
                location=regex_result.location or location,
            )

        head = chunks[:12]
        combined = "\n".join(chunk.get("content", "") for chunk in head)
        return self.extract_plan_event(combined, location=location)

    def extract_plan_timeline(self, text: str) -> List[Dict[str, Optional[str]]]:
        snippet = (text or "")[:16000].strip()
        if not snippet:
            return []

        search_window, _ = _timeline_search_window(snippet)
        regex_slots = _regex_extract_timeline(snippet)
        if regex_slots and not _timeline_regex_is_weak(regex_slots, search_window):
            return regex_slots

        ai_slots = self._ai_extract_timeline(snippet)
        if not ai_slots:
            return regex_slots
        if not regex_slots:
            return ai_slots
        # Prefer the richer, non-weak result
        if len(ai_slots) >= len(regex_slots):
            return ai_slots
        return regex_slots

    def _ai_extract_timeline(self, snippet: str) -> List[Dict[str, Optional[str]]]:
        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": PLAN_TIMELINE_PROMPT},
                    {"role": "user", "content": f"NỘI DUNG TÀI LIỆU:\n{snippet[:12000]}"},
                ],
                temperature=0,
                max_tokens=800,
            )
            content = (response.choices[0].message.content or "").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1] if "\n" in content else content[3:]
                content = content.rstrip("`").strip()
            raw = json.loads(content)
            return _parse_timeline_json(raw)
        except Exception as e:
            logger.warning(f"Plan timeline extraction error: {e}")
            return []

    def extract_plan_timeline_from_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Optional[str]]]:
        if not chunks:
            return []
        combined = "\n".join(chunk.get("content", "") for chunk in chunks)
        return self.extract_plan_timeline(combined)


task_extractor = TaskExtractor()
