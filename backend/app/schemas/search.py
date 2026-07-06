from pydantic import BaseModel
from typing import List, Optional


class SearchResult(BaseModel):
    document_name: str
    page_number: int
    content: str
    document_id: int


class SearchResponse(BaseModel):
    results: List[SearchResult]
    query: str
