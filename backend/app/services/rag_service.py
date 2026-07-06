from sqlalchemy.orm import Session

from app.repositories.conversation_repository import ConversationRepository
from app.repositories.usage_repository import UsageRepository
from app.models.conversation import MessageRole
from app.models.user import User
from app.services.faiss_service import faiss_service
from app.services.chat_service import ChatService
from app.utils.intent_detector import PersonalIntentDetector
from app.utils.query_rewriter import QueryRewriter
from app.config import settings

intent_detector = PersonalIntentDetector()
query_rewriter = QueryRewriter()


class RAGService:
    def __init__(self, db: Session):
        self.db = db
        self.conv_repo = ConversationRepository(db)
        self.usage_repo = UsageRepository(db)
        self.chat_service = ChatService()

    def search(self, query: str, top_k: int = 5) -> list:
        return faiss_service.search(query, top_k)

    def _answer_profile(self, user: User) -> str:
        role_display = "Quản trị viên (Admin)" if user.role.value == "admin" else "Người dùng (User)"
        parts = [f"Bạn là **{user.name}**."]
        parts.append(f"- Email: {user.email}")
        parts.append(f"- Vai trò: {role_display}")
        if user.department:
            parts.append(f"- Phòng ban: {user.department}")
        return "\n".join(parts)

    def chat(self, current_user: User, question: str, conversation_id: int = None) -> dict:
        user_id = current_user.id

        if conversation_id:
            conv = self.conv_repo.get_by_id(conversation_id)
            if not conv or conv.user_id != user_id:
                raise ValueError("Cuộc trò chuyện không tồn tại")
        else:
            title = question[:50] + ("..." if len(question) > 50 else "")
            conv = self.conv_repo.create(user_id, title)

        self.conv_repo.add_message(conv.id, MessageRole.user, question)

        # Load conversation history (20 messages)
        history = []
        recent_msgs = self.conv_repo.get_recent_messages(conv.id, limit=20)
        for msg in recent_msgs[:-1]:
            history.append({"role": msg.role.value, "content": msg.content})

        intent = intent_detector.detect(question)

        if intent.type == "profile":
            answer = self._answer_profile(current_user)
            self.conv_repo.add_message(conv.id, MessageRole.assistant, answer)
            return {
                "answer": answer,
                "sources": [],
                "conversation_id": conv.id,
            }

        # Query Rewriting: rewrite follow-up into standalone question
        rewritten_question = query_rewriter.rewrite(question, history)

        # Build search queries
        if intent.type == "personal_document":
            base_query = intent_detector.expand_query(
                rewritten_question, current_user, intent.time_context
            )
        else:
            base_query = rewritten_question

        # Multi-query: generate 3 variants + original
        query_variants = [base_query]
        try:
            extra_queries = query_rewriter.generate_multi_queries(base_query)
            query_variants.extend(extra_queries)
        except Exception:
            pass

        # Hybrid + Multi-query search
        raw_chunks = faiss_service.multi_query_search(query_variants, top_k=15)
        context_chunks = self.rerank_chunks(rewritten_question, raw_chunks, limit=7)

        result = self.chat_service.generate_answer(
            question, context_chunks, current_user,
            is_personal=(intent.type == "personal_document"),
            history=history,
        )

        self.usage_repo.log_usage(
            model=settings.CHAT_MODEL,
            tokens_used=result["tokens"],
            cost_usd=result["cost"],
            operation="chat",
        )

        self.conv_repo.add_message(conv.id, MessageRole.assistant, result["answer"])

        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "conversation_id": conv.id,
        }

    def get_conversations(self, user_id: int):
        return self.conv_repo.get_by_user(user_id)

    def get_conversation(self, user_id: int, conv_id: int):
        conv = self.conv_repo.get_by_id(conv_id)
        if not conv or conv.user_id != user_id:
            return None
        messages = self.conv_repo.get_messages(conv_id)
        return {"conversation": conv, "messages": messages}

    def delete_conversation(self, user_id: int, conv_id: int) -> bool:
        conv = self.conv_repo.get_by_id(conv_id)
        if not conv or conv.user_id != user_id:
            return False
        return self.conv_repo.delete(conv_id)

    def rerank_chunks(self, question: str, chunks: list, limit: int = 7) -> list:
        question_lower = question.lower()
        question_words = set(question_lower.split())

        q_words_list = question_lower.split()
        phrases = set()
        for i in range(len(q_words_list) - 1):
            phrases.add(f"{q_words_list[i]} {q_words_list[i+1]}")
        for i in range(len(q_words_list) - 2):
            phrases.add(f"{q_words_list[i]} {q_words_list[i+1]} {q_words_list[i+2]}")

        scored_chunks = []

        for chunk in chunks:
            content = chunk.get("content", "")
            content_lower = content.lower()
            content_words = set(content_lower.split())

            semantic_score = chunk.get("score", 0)

            keyword_overlap = len(question_words.intersection(content_words))
            keyword_bonus = keyword_overlap * 0.02

            phrase_bonus = 0
            for phrase in phrases:
                if phrase in content_lower:
                    phrase_bonus += 0.05

            length_penalty = 0
            if len(content) < 80:
                length_penalty = -0.15
            elif len(content) < 150:
                length_penalty = -0.05

            final_score = semantic_score + keyword_bonus + phrase_bonus + length_penalty
            chunk["rerank_score"] = final_score
            scored_chunks.append(chunk)

        scored_chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return scored_chunks[:limit]
