from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.search import SearchResponse, SearchResult
from app.services.rag_service import RAGService
from app.utils.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["Search"])


@router.get("/search", response_model=SearchResponse)
def search(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = RAGService(db)
    results = service.search(query)
    return SearchResponse(
        query=query,
        results=[SearchResult(**r) for r in results],
    )
