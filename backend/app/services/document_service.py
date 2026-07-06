import os
import uuid
import logging
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.document_repository import DocumentRepository
from app.repositories.usage_repository import UsageRepository
from app.utils.pdf_processor import process_pdf
from app.utils.word_processor import process_docx
from app.services.faiss_service import faiss_service

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db: Session):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.usage_repo = UsageRepository(db)

    def upload_document(
        self, file_content: bytes, filename: str, uploaded_by: int,
        department: str = None, month: int = None, school_year: str = None,
    ) -> dict:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

        safe_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(settings.UPLOAD_DIR, safe_filename)

        with open(filepath, "wb") as f:
            f.write(file_content)

        doc = self.doc_repo.create(
            filename, filepath, uploaded_by, 0,
            department=department, month=month, school_year=school_year,
        )

        if filename.lower().endswith(".docx"):
            chunks, page_count = process_docx(filepath, doc.id)
        else:
            chunks, page_count = process_pdf(filepath, doc.id)
        doc.page_count = page_count
        self.db.commit()

        document_names = {doc.id: filename}
        usage = faiss_service.add_chunks(chunks, document_names)

        self.usage_repo.log_usage(
            model=settings.EMBEDDING_MODEL,
            tokens_used=usage["tokens"],
            cost_usd=usage["cost"],
            operation="embedding",
        )

        # Auto-extract tasks from document
        try:
            from app.services.task_service import TaskService
            task_service = TaskService(self.db)
            extraction = task_service.extract_tasks_from_document(doc.id)
            if extraction["tasks"]:
                task_service.save_extracted_tasks(doc.id, extraction["tasks"], replace=False)
                logger.info(f"Auto-extracted {len(extraction['tasks'])} tasks from document {doc.id}")
        except Exception as e:
            logger.warning(f"Task auto-extraction failed for doc {doc.id}: {e}")

        return {
            "id": doc.id,
            "filename": filename,
            "page_count": page_count,
            "department": doc.department,
            "month": doc.month,
            "school_year": doc.school_year,
            "message": "Tài liệu đã được upload và xử lý thành công",
        }

    def delete_document(self, doc_id: int) -> bool:
        doc = self.doc_repo.get_by_id(doc_id)
        if not doc:
            return False

        faiss_service.remove_document_chunks(doc_id)

        if os.path.exists(doc.filepath):
            os.remove(doc.filepath)

        return self.doc_repo.delete(doc_id)

    def get_all_documents(self):
        docs = self.doc_repo.get_all()
        result = []
        for doc in docs:
            result.append({
                "id": doc.id,
                "filename": doc.filename,
                "page_count": doc.page_count,
                "uploaded_by": doc.uploaded_by,
                "uploader_name": doc.uploader.name if doc.uploader else None,
                "created_at": doc.created_at,
            })
        return result
