from datetime import datetime, timezone, timedelta

from openai import OpenAI
from typing import List, Dict, Any, Optional

from app.config import settings
from app.services.faiss_service import CHAT_INPUT_COST_PER_1M, CHAT_OUTPUT_COST_PER_1M


SYSTEM_PROMPT = """Bạn là VABot - trợ lý AI thông minh của Trường Trung Tiểu Học Việt Anh.

PHONG CÁCH:
- Tự nhiên, thân thiện, chuyên nghiệp.
- Trả lời bằng tiếng Việt, mạch lạc, dễ hiểu.
- Tổng hợp thông tin thành câu trả lời rõ ràng, KHÔNG copy nguyên văn tài liệu.
- Nếu cần liệt kê → gạch đầu dòng ngắn gọn.

NGUYÊN TẮC:
- Dựa trên TÀI LIỆU THAM KHẢO. Không bịa thông tin ngoài tài liệu.
- Nếu không tìm thấy → nói rõ: "Tôi không tìm thấy thông tin này trong tài liệu hiện có."
- Nếu nhiều tài liệu MÂU THUẪN → nêu từng nguồn, chỉ ra khác biệt.
- Nếu câu hỏi MƠ HỒ → hỏi lại để làm rõ.
- Cuối câu trả lời có "Nguồn tham khảo" (tên tài liệu + trang) nếu có tài liệu.

NGỮ CẢNH HỘI THOẠI:
- Hiểu "đó", "này", "nó", "ở trên" dựa trên lịch sử.
- Kết nối câu hỏi tiếp theo với ngữ cảnh trước.

KHI KHÔNG CÓ TÀI LIỆU LIÊN QUAN:
- Câu hỏi chào hỏi, cảm ơn, tạm biệt → trả lời lịch sự, tự nhiên.
- Câu hỏi về thời gian, ngày tháng → dùng THỜI GIAN HIỆN TẠI.
- Câu hỏi chung (không cần tài liệu) → trả lời tự nhiên như trợ lý.
- Câu hỏi cần tài liệu nhưng không có → nói rõ không tìm thấy."""


class ChatService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def generate_answer(
        self,
        question: str,
        context_chunks: List[Dict[str, Any]],
        current_user=None,
        is_personal: bool = False,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> dict:
        context_parts = []
        sources = []
        seen_sources = set()

        for i, chunk in enumerate(context_chunks, start=1):
            doc_name = chunk.get("document_name", "Không rõ tài liệu")
            page = chunk.get("page_number", "Không rõ trang")
            content = chunk.get("content", "")

            context_parts.append(
                f"[Nguồn {i}] {doc_name} - Trang {page}:\n{content}"
            )

            source_key = (doc_name, page)
            if source_key not in seen_sources:
                seen_sources.add(source_key)
                sources.append({
                    "document_name": doc_name,
                    "page_number": page,
                })

        context_text = "\n\n---\n\n".join(context_parts) if context_parts else ""

        system_content = SYSTEM_PROMPT

        vn_tz = timezone(timedelta(hours=7))
        now = datetime.now(vn_tz)
        days_vi = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
        day_name = days_vi[now.weekday()]
        time_info = (
            f"\n\nHÔM NAY: {day_name}, {now.strftime('%d/%m/%Y')}, {now.strftime('%H:%M')} giờ Việt Nam. "
            f"Tháng {now.month}, năm {now.year}."
        )
        system_content += time_info

        if current_user:
            user_context = (
                f"\n\nNGƯỜI ĐANG HỎI: {current_user.name} "
                f"({current_user.email}, vai trò: {current_user.role.value})"
            )
            system_content += user_context

            if is_personal:
                personal_rules = (
                    f"\n\nCÁ NHÂN HÓA:\n"
                    f"- Người hỏi là {current_user.name}. \"Tôi/mình/của tôi\" = {current_user.name}.\n"
                    f"- Chỉ trả lời thông tin liên quan đến {current_user.name}.\n"
                    f"- Không đưa thông tin của người khác khi hỏi về \"tôi\".\n"
                    f"- Nếu không tìm thấy → nói rõ không tìm thấy."
                )
                system_content += personal_rules
            else:
                system_content += "\n\nUser context chỉ để biết ai đang hỏi. Không bịa thông tin từ context."

        if context_text:
            user_prompt = f"""Dựa trên tài liệu bên dưới, trả lời câu hỏi của tôi.

TÀI LIỆU:
{context_text}

CÂU HỎI: {question}

Hãy tổng hợp thông tin và trả lời tự nhiên. Cuối câu ghi nguồn tham khảo."""
        else:
            user_prompt = f"""{question}"""

        messages = [{"role": "system", "content": system_content}]

        if history:
            for msg in history:
                messages.append(msg)

        messages.append({"role": "user", "content": user_prompt})

        response = self.client.chat.completions.create(
            model=settings.CHAT_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=4000,
        )

        answer = response.choices[0].message.content or ""

        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        total_tokens = input_tokens + output_tokens

        cost = (
            (input_tokens / 1_000_000) * CHAT_INPUT_COST_PER_1M
            + (output_tokens / 1_000_000) * CHAT_OUTPUT_COST_PER_1M
        )

        return {
            "answer": answer.strip(),
            "sources": sources,
            "tokens": total_tokens,
            "cost": cost,
        }
