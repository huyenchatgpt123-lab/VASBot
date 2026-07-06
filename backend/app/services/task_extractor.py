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
- Nếu deadline ghi dạng "tuần 2 tháng 7" → chuyển thành ngày cụ thể (lấy ngày cuối tuần đó).
- Nếu deadline ghi "tháng 7/2026" → lấy ngày cuối tháng: 2026-07-31.
- Nếu không có deadline → để null.
- Tên người: giữ nguyên họ tên đầy đủ trong tài liệu.
- Nếu 1 người có nhiều công việc → tạo nhiều dòng riêng.
- QUAN TRỌNG: Nếu 1 công việc giao cho NHIỀU NGƯỜI (VD: "A, B, C phụ trách X") → TÁCH thành nhiều dòng riêng biệt, mỗi người 1 dòng với cùng tên công việc.
- Viết JSON ngắn gọn, tên công việc tóm tắt dưới 60 ký tự.

TRẢ VỀ JSON ARRAY (không giải thích gì thêm):
[{"title":"Tên CV","assignee_name":"Họ tên","deadline":"YYYY-MM-DD hoặc null"}]

Nếu không tìm thấy công việc nào → trả về: []"""


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


task_extractor = TaskExtractor()
