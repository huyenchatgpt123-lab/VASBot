import re
from app.config import settings


def clean_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\x00", " ")

    # Collapse multiple spaces (but preserve newlines for structure)
    text = re.sub(r"[^\S\n]+", " ", text)

    # Collapse 3+ consecutive newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> list[str]:
    if not text or not text.strip():
        return []

    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap or settings.CHUNK_OVERLAP

    text = clean_text(text)

    # Split by paragraphs (double newline) first, then by single newline
    paragraphs = re.split(r"\n\n+", text)

    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If single paragraph fits in current chunk, add it
        if len(current) + len(para) + 2 <= chunk_size:
            current = current + "\n\n" + para if current else para
        else:
            # Current chunk is full, save it
            if current:
                chunks.append(current.strip())

            # If paragraph itself is too long, split by sentences
            if len(para) > chunk_size:
                sentences = re.split(r"(?<=[.!?;])\s+", para)
                overlap_text = current[-overlap:] if len(current) > overlap else current
                current = overlap_text

                for sentence in sentences:
                    if len(current) + len(sentence) + 1 <= chunk_size:
                        current = current + " " + sentence if current else sentence
                    else:
                        if current:
                            chunks.append(current.strip())
                        overlap_text = current[-overlap:] if len(current) > overlap else current
                        current = overlap_text + " " + sentence if overlap_text else sentence
            else:
                # Start new chunk with overlap from previous
                overlap_text = current[-overlap:] if len(current) > overlap else current
                current = overlap_text + "\n\n" + para if overlap_text else para

    if current and current.strip():
        chunks.append(current.strip())

    # Filter out chunks that are too short to be useful
    chunks = [c for c in chunks if len(c) >= 50]

    return chunks
