import os
import json
import fitz
from typing import List, Dict, Any

from app.config import settings
from app.utils.chunking import chunk_text


def extract_text_from_pdf(filepath: str) -> List[Dict[str, Any]]:
    """Extract text from PDF with page numbers."""
    pages = []
    doc = fitz.open(filepath)
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        if text.strip():
            pages.append({"page_number": page_num + 1, "text": text})
    doc.close()
    return pages


def process_pdf(filepath: str, document_id: int) -> List[Dict[str, Any]]:
    """Extract text, chunk, and return chunk metadata."""
    pages = extract_text_from_pdf(filepath)
    all_chunks = []

    for page_data in pages:
        page_text = page_data["text"]
        page_number = page_data["page_number"]
        chunks = chunk_text(page_text, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP)

        for chunk_content in chunks:
            all_chunks.append({
                "document_id": document_id,
                "content": chunk_content,
                "page_number": page_number,
            })

    return all_chunks, len(pages)
