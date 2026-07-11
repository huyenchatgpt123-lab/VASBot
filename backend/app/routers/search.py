from fastapi import APIRouter, Depends, Query

from app.schemas.search import SearchResponse, SearchResult
from app.services.faiss_service import faiss_service
from app.utils.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["Search"])


@router.get("/search", response_model=SearchResponse)
def search(
    query: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    results = faiss_service.search(query)
    return SearchResponse(
        query=query,
        results=[SearchResult(**r) for r in results],
    )
