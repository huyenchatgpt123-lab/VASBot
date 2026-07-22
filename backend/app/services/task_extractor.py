import json
import re
import logging
from typing import List, Dict, Any, Optional
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

PLAN_EVENT_PROMPT = """Bạn đọc phần đầu tài liệu kế hoạch/công tác và trích xuất NGÀY/GIỜ DIỄN RA kế hoạch từ các dòng bắt đầu bằng "Thời gian:" hoặc "Ngày:".

QUY TẮC:
- Ưu tiên dòng "Thời gian:"; nếu không có thì dùng "Ngày:".
- date: chuyển về "YYYY-MM-DD" (VD: ngày 24/7/2026 → 2026-07-24).
- time: nếu có giờ rõ ràng (8h30, 14:00, 8 giờ sáng…) → "HH:MM" (24h); nếu chỉ có ngày → null.
- Không dùng deadline công việc hay ngày upload.
- Không giải thích.

TRẢ VỀ JSON (không markdown):
{"date":"YYYY-MM-DD","time":"HH:MM hoặc null"}

Nếu không tìm thấy → {"date":null,"time":null}"""

PLAN_TITLE_PROMPT = """Bạn đọc phần đầu tài liệu kế hoạch/công tác và trích xuất TIÊU ĐỀ CHÍNH THỨC của kế hoạch (dòng tiêu đề lớn, thường ở trang đầu).

QUY TẮC:
- Trả về đúng MỘT dòng tiêu đề như trong tài liệu (tiếng Việt, giữ số/tháng/năm học nếu có).
- Không thêm giải thích, dấu ngoặc, markdown hay JSON.
- Không dùng tên file.
- Tối đa 120 ký tự.
- Nếu không xác định được tiêu đề → trả về chuỗi rỗng."""


_EVENT_LINE_RE = re.compile(
    r"(?:Thời\s*gian|Ngày)\s*:\s*(.+)",
    re.IGNORECASE,
)
_VN_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
_TIME_H_RE = re.compile(r"(\d{1,2})\s*h\s*(\d{2})?", re.IGNORECASE)
_TIME_COLON_RE = re.compile(r"(\d{1,2}):(\d{2})")


def _build_plan_event_datetime(date_part: str, time_part: Optional[str] = None) -> Optional[datetime]:
    match = _VN_DATE_RE.search(date_part)
    if not match:
        try:
            return datetime.strptime(date_part[:10], "%Y-%m-%d").replace(hour=0, minute=0, second=0)
        except ValueError:
            return None

    day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hour, minute = 0, 0

    if time_part:
        hm = _TIME_COLON_RE.search(time_part)
        if hm:
            hour, minute = int(hm.group(1)), int(hm.group(2))
        else:
            h_match = _TIME_H_RE.search(time_part)
            if h_match:
                hour = int(h_match.group(1))
                minute = int(h_match.group(2) or 0)

    try:
        return datetime(year, month, day, hour, minute, 0)
    except ValueError:
        return None


def _regex_extract_plan_event(text: str) -> Optional[datetime]:
    for match in _EVENT_LINE_RE.finditer(text):
        line = match.group(1).strip()
        if not line:
            continue
        date_match = _VN_DATE_RE.search(line)
        if not date_match:
            continue
        time_part = line[: date_match.start()] + line[date_match.end() :]
        return _build_plan_event_datetime(date_match.group(0), time_part)
    return None


def _parse_plan_event_json(raw: dict) -> Optional[datetime]:
    date_val = raw.get("date")
    if not date_val or str(date_val).lower() == "null":
        return None
    time_val = raw.get("time")
    if time_val in (None, "", "null"):
        time_val = None
    return _build_plan_event_datetime(str(date_val), str(time_val) if time_val else None)


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

    def extract_plan_event(self, text: str) -> Optional[datetime]:
        snippet = text[:6000].strip()
        if not snippet:
            return None

        regex_result = _regex_extract_plan_event(snippet)
        if regex_result:
            return regex_result

        try:
            response = self.client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": PLAN_EVENT_PROMPT},
                    {"role": "user", "content": f"PHẦN ĐẦU TÀI LIỆU:\n{snippet}"},
                ],
                temperature=0,
                max_tokens=120,
            )
            content = (response.choices[0].message.content or "").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1] if "\n" in content else content[3:]
                content = content.rstrip("`").strip()
            raw = json.loads(content)
            if isinstance(raw, dict):
                return _parse_plan_event_json(raw)
        except Exception as e:
            logger.warning(f"Plan event extraction error: {e}")
        return None

    def extract_plan_event_from_chunks(self, chunks: List[Dict[str, Any]]) -> Optional[datetime]:
        if not chunks:
            return None
        head = chunks[:8]
        combined = "\n".join(chunk.get("content", "") for chunk in head)
        return self.extract_plan_event(combined)


task_extractor = TaskExtractor()
