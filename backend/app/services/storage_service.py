import logging
import os
import tempfile
import uuid
from typing import Optional, Tuple

import cloudinary
import cloudinary.uploader
import cloudinary.utils

from app.config import settings

logger = logging.getLogger(__name__)

CLOUDINARY_PREFIX = "cloudinary:"


def use_cloudinary() -> bool:
    if settings.STORAGE_BACKEND != "cloudinary":
        return False
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )


def _configure_cloudinary() -> None:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def _resource_type_for_filename(filename: str) -> str:
    return "image" if filename.lower().endswith(".pdf") else "raw"


def storage_ref(resource_type: str, public_id: str) -> str:
    return f"{CLOUDINARY_PREFIX}{resource_type}:{public_id}"


def parse_storage_ref(filepath: str) -> Tuple[str, Optional[str], str]:
    if filepath.startswith(CLOUDINARY_PREFIX):
        rest = filepath[len(CLOUDINARY_PREFIX):]
        resource_type, public_id = rest.split(":", 1)
        return "cloudinary", resource_type, public_id
    return "local", None, filepath


def write_temp_file(file_content: bytes, filename: str) -> str:
    suffix = os.path.splitext(filename)[1] or ".bin"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    with open(path, "wb") as f:
        f.write(file_content)
    return path


def upload_document_file(file_content: bytes, filename: str) -> str:
    if use_cloudinary():
        _configure_cloudinary()
        resource_type = _resource_type_for_filename(filename)
        base_name = os.path.splitext(filename)[0]
        public_id = f"{uuid.uuid4()}_{base_name}"
        result = cloudinary.uploader.upload(
            file_content,
            folder="vabot/documents",
            public_id=public_id,
            resource_type=resource_type,
            overwrite=True,
        )
        stored_type = result.get("resource_type", resource_type)
        return storage_ref(stored_type, result["public_id"])

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_filename = f"{uuid.uuid4()}_{filename}"
    filepath = os.path.join(settings.UPLOAD_DIR, safe_filename)
    with open(filepath, "wb") as f:
        f.write(file_content)
    return filepath


def delete_stored_file(filepath: str) -> None:
    kind, resource_type, ref = parse_storage_ref(filepath)
    if kind == "cloudinary":
        _configure_cloudinary()
        try:
            cloudinary.uploader.destroy(ref, resource_type=resource_type)
        except Exception as e:
            logger.warning("Cloudinary delete failed for %s: %s", ref, e)
        return

    if os.path.exists(ref):
        os.remove(ref)


def file_exists(filepath: str) -> bool:
    kind, _, ref = parse_storage_ref(filepath)
    if kind == "cloudinary":
        return True
    return os.path.exists(ref)


def get_preview_url(filepath: str, filename: str) -> str:
    kind, resource_type, ref = parse_storage_ref(filepath)
    if kind != "cloudinary":
        raise ValueError("Not a Cloudinary file")

    _configure_cloudinary()
    if filename.lower().endswith(".pdf"):
        url, _ = cloudinary.utils.cloudinary_url(
            ref,
            resource_type="image",
            secure=True,
        )
        return url
    url, _ = cloudinary.utils.cloudinary_url(
        ref,
        resource_type=resource_type,
        secure=True,
        flags="attachment",
    )
    return url


def get_download_url(filepath: str, filename: str) -> str:
    kind, resource_type, ref = parse_storage_ref(filepath)
    if kind != "cloudinary":
        raise ValueError("Not a Cloudinary file")

    _configure_cloudinary()
    url, _ = cloudinary.utils.cloudinary_url(
        ref,
        resource_type=resource_type,
        secure=True,
        flags=f"attachment:{filename}",
    )
    return url
