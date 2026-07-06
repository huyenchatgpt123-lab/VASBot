from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message, MessageRole


class ConversationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, conv_id: int) -> Optional[Conversation]:
        return self.db.query(Conversation).filter(Conversation.id == conv_id).first()

    def get_by_user(self, user_id: int) -> List[Conversation]:
        return (
            self.db.query(Conversation)
            .filter(Conversation.user_id == user_id)
            .order_by(Conversation.created_at.desc())
            .all()
        )

    def create(self, user_id: int, title: str = "Cuộc trò chuyện mới") -> Conversation:
        conv = Conversation(user_id=user_id, title=title)
        self.db.add(conv)
        self.db.commit()
        self.db.refresh(conv)
        return conv

    def update_title(self, conv_id: int, title: str) -> Optional[Conversation]:
        conv = self.get_by_id(conv_id)
        if conv:
            conv.title = title
            self.db.commit()
            self.db.refresh(conv)
        return conv

    def delete(self, conv_id: int) -> bool:
        conv = self.get_by_id(conv_id)
        if not conv:
            return False
        self.db.delete(conv)
        self.db.commit()
        return True

    def count(self) -> int:
        return self.db.query(Conversation).count()

    def add_message(self, conversation_id: int, role: MessageRole, content: str) -> Message:
        msg = Message(conversation_id=conversation_id, role=role, content=content)
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return msg

    def get_messages(self, conversation_id: int) -> List[Message]:
        return (
            self.db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .all()
        )

    def get_recent_messages(self, conversation_id: int, limit: int = 10) -> List[Message]:
        msgs = (
            self.db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
            .all()
        )
        return list(reversed(msgs))

    def count_user_messages(self) -> int:
        return self.db.query(Message).filter(Message.role == MessageRole.user).count()

    def get_activity_by_date(self, days: int = 30) -> List[dict]:
        from datetime import datetime, timedelta
        from sqlalchemy import func

        start_date = datetime.utcnow() - timedelta(days=days)
        conv_activity = (
            self.db.query(
                func.date(Conversation.created_at).label("date"),
                func.count(Conversation.id).label("conversations"),
            )
            .filter(Conversation.created_at >= start_date)
            .group_by(func.date(Conversation.created_at))
            .all()
        )
        msg_activity = (
            self.db.query(
                func.date(Message.created_at).label("date"),
                func.count(Message.id).label("questions"),
            )
            .filter(Message.created_at >= start_date, Message.role == MessageRole.user)
            .group_by(func.date(Message.created_at))
            .all()
        )

        activity_map = {}
        for row in conv_activity:
            activity_map[str(row.date)] = {"conversations": row.conversations, "questions": 0}
        for row in msg_activity:
            date_str = str(row.date)
            if date_str in activity_map:
                activity_map[date_str]["questions"] = row.questions
            else:
                activity_map[date_str] = {"conversations": 0, "questions": row.questions}

        return [
            {"date": date, "conversations": data["conversations"], "questions": data["questions"]}
            for date, data in sorted(activity_map.items())
        ]
