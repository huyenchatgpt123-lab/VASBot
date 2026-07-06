from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class Source(BaseModel):
    document_name: str
    page_number: int


class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    conversation_id: int


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class ConversationListItem(BaseModel):
    id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True
