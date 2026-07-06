from typing import List, Dict, Optional
from openai import OpenAI
from app.config import settings


REWRITE_PROMPT = """Bạn là trợ lý viết lại câu hỏi. Nhiệm vụ:
- Nhận câu hỏi hiện tại + lịch sử hội thoại
- Viết lại câu hỏi thành câu ĐẦY ĐỦ, ĐỘC LẬP (không cần đọc history cũng hiểu)
- Giữ nguyên ý nghĩa, ngôn ngữ tiếng Việt
- Thay thế đại từ "đó", "này", "nó", "ở trên" bằng nội dung cụ thể từ history
- Nếu câu hỏi đã đầy đủ rồi thì giữ nguyên
- CHỈ trả về câu hỏi đã viết lại, không giải thích gì thêm."""

MULTI_QUERY_PROMPT = """Bạn là trợ lý tạo biến thể câu hỏi để tìm kiếm tài liệu. Nhiệm vụ:
- Nhận 1 câu hỏi
- Tạo 3 biến thể khác nhau của câu hỏi đó (cùng ý nghĩa, khác cách diễn đạt)
- Mỗi biến thể trên 1 dòng
- CHỈ trả về 3 dòng câu hỏi, không đánh số, không giải thích."""


class QueryRewriter:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def rewrite(self, question: str, history: List[Dict[str, str]]) -> str:
        if not history:
            return question

        history_text = ""
        for msg in history[-6:]:
            role = "User" if msg["role"] == "user" else "AI"
            history_text += f"{role}: {msg['content']}\n"

        messages = [
            {"role": "system", "content": REWRITE_PROMPT},
            {"role": "user", "content": f"Lịch sử:\n{history_text}\nCâu hỏi hiện tại: {question}\n\nViết lại:"},
        ]

        response = self.client.chat.completions.create(
            model=settings.REWRITE_MODEL,
            messages=messages,
            temperature=0,
            max_tokens=200,
        )

        rewritten = response.choices[0].message.content.strip()
        return rewritten if rewritten else question

    def generate_multi_queries(self, question: str) -> List[str]:
        messages = [
            {"role": "system", "content": MULTI_QUERY_PROMPT},
            {"role": "user", "content": question},
        ]

        response = self.client.chat.completions.create(
            model=settings.REWRITE_MODEL,
            messages=messages,
            temperature=0.5,
            max_tokens=300,
        )

        result = response.choices[0].message.content.strip()
        variants = [line.strip() for line in result.split("\n") if line.strip()]
        return variants[:3]
