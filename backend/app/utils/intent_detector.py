import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class IntentResult:
    type: str  # "profile" | "personal_document" | "general"
    time_context: Optional[str] = None


PERSONAL_PRONOUNS = re.compile(
    r"\b(tôi|của tôi|mình|của mình)\b", re.IGNORECASE
)

PROFILE_PATTERNS = re.compile(
    r"(tôi là ai|tôi tên (gì|là)|tên (của )?tôi|email (của )?(tôi|mình)"
    r"|vai trò (của )?(tôi|mình)|thông tin (của )?(tôi|mình)"
    r"|tôi là gì|chức vụ (của )?(tôi|mình)|tài khoản (của )?(tôi|mình))",
    re.IGNORECASE,
)

PERSONAL_DOC_KEYWORDS = re.compile(
    r"(công việc|việc|nhiệm vụ|phân công|được phân công|deadline|hạn"
    r"|kế hoạch|lịch|lịch trình|báo cáo|dự án|task"
    r"|làm gì|cần làm|phải làm|được giao|trách nhiệm"
    r"|tiến độ|hoàn thành|mục tiêu|chỉ tiêu|KPI)",
    re.IGNORECASE,
)

TIME_PATTERNS = {
    "hôm nay": re.compile(r"\bhôm nay\b", re.IGNORECASE),
    "tuần này": re.compile(r"\btuần (này|nay)\b", re.IGNORECASE),
    "tháng này": re.compile(r"\btháng (này|nay)\b", re.IGNORECASE),
    "tuần tới": re.compile(r"\btuần (tới|sau)\b", re.IGNORECASE),
    "tháng tới": re.compile(r"\btháng (tới|sau)\b", re.IGNORECASE),
}


class PersonalIntentDetector:
    def detect(self, question: str) -> IntentResult:
        if not PERSONAL_PRONOUNS.search(question):
            return IntentResult(type="general")

        if PROFILE_PATTERNS.search(question):
            return IntentResult(type="profile")

        if PERSONAL_DOC_KEYWORDS.search(question):
            time_ctx = self._detect_time_context(question)
            return IntentResult(type="personal_document", time_context=time_ctx)

        has_question_mark = "?" in question
        has_what_verb = re.search(r"\b(gì|nào|sao|bao giờ)\b", question, re.IGNORECASE)
        if has_question_mark or has_what_verb:
            time_ctx = self._detect_time_context(question)
            return IntentResult(type="personal_document", time_context=time_ctx)

        return IntentResult(type="general")

    def _detect_time_context(self, question: str) -> Optional[str]:
        for label, pattern in TIME_PATTERNS.items():
            if pattern.search(question):
                return label
        return None

    def expand_query(self, question: str, user, time_context: Optional[str] = None) -> str:
        parts = [question]
        parts.append(f"Người dùng: {user.name}")
        parts.append(
            f"Tìm tất cả công việc, nhiệm vụ, phân công, deadline, "
            f"lịch trình liên quan đến {user.name}"
        )
        if time_context:
            now = datetime.now()
            parts.append(f"Thời gian: {time_context} ({now.strftime('%d/%m/%Y')})")
        return "\n".join(parts)
