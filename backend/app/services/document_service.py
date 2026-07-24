import os
import logging
from typing import List, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.document_repository import DocumentRepository
from app.repositories.usage_repository import UsageRepository
from app.utils.pdf_processor import process_pdf
from app.utils.word_processor import process_docx
from app.services.faiss_service import faiss_service
from app.services.task_extractor import task_extractor
from app.services.plan_event_service import PlanEventService
from app.services.storage_service import (
    upload_document_file,
    delete_stored_file,
    write_temp_file,
    read_stored_file_bytes,
)

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db: Session):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.usage_repo = UsageRepository(db)

    def upload_document(
        self, file_content: bytes, filename: str, uploaded_by: int,
        department: str = None, month: int = None, school_year: str = None,
        campus_ids: Optional[List[int]] = None,
        include_in_calendar: bool = False,
        extract_tasks: bool = True,
    ) -> dict:
        from app.repositories.campus_repository import CampusRepository

        temp_path = write_temp_file(file_content, filename)
        storage_path = None
        campuses = []
        if campus_ids:
            campuses = CampusRepository(self.db).get_by_ids(campus_ids)

        try:
            storage_path = upload_document_file(file_content, filename)

            doc = self.doc_repo.create(
                filename, storage_path, uploaded_by, 0,
                department=department, month=month, school_year=school_year,
                campuses=campuses,
                include_in_calendar=include_in_calendar,
            )

            if filename.lower().endswith(".docx"):
                chunks, page_count = process_docx(temp_path, doc.id)
            else:
                chunks, page_count = process_pdf(temp_path, doc.id)
            doc.page_count = page_count

            plan_title = task_extractor.extract_plan_title_from_chunks(chunks)
            if plan_title:
                doc.plan_title = plan_title

            plan_event = task_extractor.extract_plan_event_from_chunks(chunks)
            if include_in_calendar:
                # Spec: opted-in → create event; 0 date → needs_review placeholder (admin must edit)
                PlanEventService(self.db).replace_ai_events_for_document(
                    doc,
                    title=plan_title or doc.plan_title,
                    starts_at=plan_event.start if plan_event else None,
                    ends_at=plan_event.end if plan_event else None,
                    include_in_calendar=True,
                )
            elif plan_event:
                # Keep denormalized plan fields for Documents page, but not on calendar
                doc.plan_event_at = plan_event.start
                doc.plan_event_end_at = plan_event.end
                doc.include_in_calendar = False

            self.db.commit()

            document_names = {doc.id: plan_title or filename}
            usage = faiss_service.add_chunks(chunks, document_names)

            self.usage_repo.log_usage(
                model=settings.EMBEDDING_MODEL,
                tokens_used=usage["tokens"],
                cost_usd=usage["cost"],
                operation="embedding",
            )

            task_preview = None
            if extract_tasks:
                try:
                    from app.services.task_service import TaskService
                    task_preview = TaskService(self.db).extract_tasks_from_document(doc.id)
                    logger.info(
                        "Task extract preview for doc %s: %s rows (not saved)",
                        doc.id,
                        len(task_preview.get("tasks") or []),
                    )
                except Exception as e:
                    logger.warning(f"Task extraction preview failed for doc {doc.id}: {e}")
                    task_preview = {
                        "tasks": [],
                        "document_id": doc.id,
                        "document_name": doc.plan_title or filename,
                        "has_duplicates": False,
                        "duplicate_count": 0,
                    }

            return {
                "id": doc.id,
                "filename": filename,
                "plan_title": doc.plan_title,
                "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
                "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
                "include_in_calendar": bool(doc.include_in_calendar),
                "extract_tasks": bool(extract_tasks),
                "task_preview": task_preview,
                "page_count": page_count,
                "department": doc.department,
                "month": doc.month,
                "school_year": doc.school_year,
                "campus_ids": [c.id for c in doc.campuses],
                "campuses": [c.code for c in doc.campuses],
                "message": "Tài liệu đã được upload và xử lý thành công",
            }
        except Exception:
            if storage_path:
                delete_stored_file(storage_path)
            raise
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def delete_document(self, doc_id: int) -> bool:
        doc = self.doc_repo.get_by_id(doc_id)
        if not doc:
            return False

        faiss_service.remove_document_chunks(doc_id)
        delete_stored_file(doc.filepath)

        return self.doc_repo.delete(doc_id)

    def re_extract_plan_metadata(self, doc_id: int) -> dict:
        doc = self.doc_repo.get_by_id(doc_id)
        if not doc:
            raise ValueError("Tài liệu không tồn tại")

        file_bytes = read_stored_file_bytes(doc.filepath)
        temp_path = write_temp_file(file_bytes, doc.filename)
        try:
            if doc.filename.lower().endswith(".docx"):
                chunks, _ = process_docx(temp_path, doc.id)
            else:
                chunks, _ = process_pdf(temp_path, doc.id)

            plan_title = task_extractor.extract_plan_title_from_chunks(chunks)
            plan_event = task_extractor.extract_plan_event_from_chunks(chunks)

            on_calendar = bool(doc.include_in_calendar)
            events = []

            if on_calendar:
                # Opted-in: refresh AI calendar event (0 date → needs_review)
                events = PlanEventService(self.db).replace_ai_events_for_document(
                    doc,
                    title=plan_title or doc.plan_title,
                    starts_at=plan_event.start if plan_event else None,
                    ends_at=plan_event.end if plan_event else None,
                    include_in_calendar=True,
                )
            else:
                # Not on calendar: only update denormalized metadata (same as upload without opt-in)
                if plan_title:
                    doc.plan_title = plan_title
                if plan_event:
                    doc.plan_event_at = plan_event.start
                    doc.plan_event_end_at = plan_event.end
                else:
                    doc.plan_event_at = None
                    doc.plan_event_end_at = None
                doc.include_in_calendar = False

            self.db.commit()
            self.db.refresh(doc)

            primary = events[0] if events else None
            needs_review = bool(primary.needs_review) if primary else (on_calendar and not plan_event)
            if on_calendar and primary and primary.needs_review:
                message = "Đã trích xuất lại thông tin kế hoạch — cần chỉnh sửa ngày/giờ"
            elif plan_event or plan_title:
                message = "Đã trích xuất lại thông tin kế hoạch"
            else:
                message = "Đã chạy lại trích xuất — không tìm thấy tiêu đề/ngày trong file"

            return {
                "document_id": doc.id,
                "plan_title": doc.plan_title,
                "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
                "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
                "event_count": len(events),
                "needs_review": needs_review,
                "message": message,
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

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
