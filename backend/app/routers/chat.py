from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse, ConversationListItem, ConversationResponse, MessageResponse
from app.services.rag_service import RAGService
from app.utils.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = RAGService(db)
    try:
        result = service.chat(current_user, request.question, request.conversation_id)
        return ChatResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/conversations", response_model=List[ConversationListItem])
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = RAGService(db)
    convs = service.get_conversations(current_user.id)
    return [ConversationListItem.model_validate(c) for c in convs]


@router.get("/conversations/{conv_id}", response_model=ConversationResponse)
def get_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = RAGService(db)
    result = service.get_conversation(current_user.id, conv_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuộc trò chuyện không tồn tại")

    conv = result["conversation"]
    messages = result["messages"]
    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        messages=[MessageResponse.model_validate(m) for m in messages],
    )


@router.delete("/conversations/{conv_id}")
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = RAGService(db)
    if not service.delete_conversation(current_user.id, conv_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuộc trò chuyện không tồn tại")
    return {"message": "Cuộc trò chuyện đã được xóa"}
