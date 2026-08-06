"""Shared helpers for rejecting oversized uploads."""
from fastapi import HTTPException, UploadFile, status

from app.config import settings


async def read_upload_limited(file: UploadFile, *, max_bytes: int | None = None) -> bytes:
    limit = max_bytes if max_bytes is not None else settings.MAX_UPLOAD_BYTES
    # Prefer Content-Length when present
    content_length = None
    if file.headers:
        raw = file.headers.get("content-length")
        if raw and raw.isdigit():
            content_length = int(raw)
    if content_length is not None and content_length > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File vượt quá giới hạn {limit // (1024 * 1024)}MB",
        )

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File vượt quá giới hạn {limit // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)
