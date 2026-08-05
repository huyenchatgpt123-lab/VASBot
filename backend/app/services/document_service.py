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
from app.services.task_extractor import (
    task_extractor,
    serialize_plan_day_packages,
    PlanDayPackage,
)
from app.services.plan_event_service import PlanEventService, clean_timeline_slots
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

            day_packages = task_extractor.extract_plan_calendar_days_from_chunks(chunks)
            primary = day_packages[0] if day_packages else None
            starts_at = primary.start if primary else None
            ends_at = primary.end if primary else None
            location = primary.location if primary else None
            timeline = list(primary.timeline or []) if primary else []
            if len(day_packages) > 1:
                last = day_packages[-1]
                ends_at = last.end or last.start

            event_rows = serialize_plan_day_packages(
                day_packages,
                default_title=plan_title or doc.plan_title or filename,
            )

            calendar_preview = None
            if include_in_calendar:
                # Do not write calendar until admin confirms preview (5B).
                doc.include_in_calendar = False
                if primary:
                    doc.plan_event_at = starts_at
                    doc.plan_event_end_at = ends_at
                calendar_preview = {
                    "document_id": doc.id,
                    "plan_title": plan_title or doc.plan_title or filename,
                    "plan_event_at": starts_at.isoformat() if starts_at else None,
                    "plan_event_end_at": ends_at.isoformat() if ends_at else None,
                    "location": location,
                    "timeline": timeline or [],
                    "events": event_rows,
                    "needs_review": starts_at is None,
                }
            elif primary:
                # Keep denormalized plan fields for Documents page, but not on calendar
                doc.plan_event_at = primary.start
                doc.plan_event_end_at = ends_at
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
                "calendar_preview": calendar_preview,
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

    def re_extract_plan_metadata(
        self,
        doc_id: int,
        *,
        put_on_calendar: bool = True,
        preview_only: bool = False,
    ) -> dict:
        """
        Re-extract plan title/date/location from file.
        preview_only=True → return extracted fields without writing DB.
        put_on_calendar=True → refresh/create calendar event (Lịch hoạt động).
        put_on_calendar=False → only update document metadata, stay off calendar.
        """
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
            day_packages = task_extractor.extract_plan_calendar_days_from_chunks(chunks)
            display_title = plan_title or doc.plan_title
            event_rows = serialize_plan_day_packages(day_packages, default_title=display_title)
            primary_pkg = day_packages[0] if day_packages else None
            location = primary_pkg.location if primary_pkg else None
            starts_at = primary_pkg.start if primary_pkg else None
            ends_at = primary_pkg.end if primary_pkg else None
            if len(day_packages) > 1:
                last = day_packages[-1]
                ends_at = last.end or last.start
            timeline = list(primary_pkg.timeline or []) if primary_pkg else []

            if preview_only:
                return {
                    "document_id": doc.id,
                    "plan_title": display_title,
                    "plan_event_at": starts_at.isoformat() if starts_at else None,
                    "plan_event_end_at": ends_at.isoformat() if ends_at else None,
                    "location": location,
                    "timeline": timeline or [],
                    "events": event_rows,
                    "event_count": len(event_rows),
                    "needs_review": starts_at is None,
                    "preview_only": True,
                    "message": (
                        "Đã trích (xem trước) — bấm Lưu để cập nhật sự kiện"
                        if (day_packages or plan_title or timeline)
                        else "Không tìm thấy tiêu đề/ngày/địa điểm trong file"
                    ),
                }

            events = []

            if put_on_calendar:
                event_specs = [
                    {
                        "title": row.get("plan_title") or display_title,
                        "starts_at": pkg.start,
                        "ends_at": pkg.end,
                        "location": pkg.location,
                        "timeline": pkg.timeline,
                    }
                    for pkg, row in zip(day_packages, event_rows)
                ] or [{
                    "title": display_title,
                    "starts_at": None,
                    "ends_at": None,
                    "location": location,
                    "timeline": None,
                }]
                events = PlanEventService(self.db).replace_ai_events_for_document(
                    doc,
                    title=display_title,
                    events=event_specs,
                    include_in_calendar=True,
                )
            else:
                if plan_title:
                    doc.plan_title = plan_title
                if primary_pkg:
                    doc.plan_event_at = starts_at
                    doc.plan_event_end_at = ends_at
                else:
                    doc.plan_event_at = None
                    doc.plan_event_end_at = None
                doc.include_in_calendar = False

            self.db.commit()
            self.db.refresh(doc)

            primary = events[0] if events else None
            needs_review = bool(primary.needs_review) if primary else (put_on_calendar and not primary_pkg)
            if put_on_calendar and primary and primary.needs_review:
                message = "Đã trích lên Lịch hoạt động — cần chỉnh sửa ngày/giờ"
            elif put_on_calendar:
                message = "Đã trích xuất và đưa lên Lịch hoạt động"
            elif primary_pkg or plan_title:
                message = "Đã trích xuất lại thông tin kế hoạch"
            else:
                message = "Đã chạy lại trích xuất — không tìm thấy tiêu đề/ngày trong file"

            return {
                "document_id": doc.id,
                "plan_title": doc.plan_title,
                "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
                "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
                "location": (primary.location if primary else location),
                "timeline": timeline or [],
                "events": event_rows,
                "event_count": len(events),
                "needs_review": needs_review,
                "preview_only": False,
                "message": message,
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _remove_document_from_calendar(self, doc) -> dict:
        """Admin reviewed the extraction and decided this plan does not belong on the calendar."""
        from app.models.plan_event import PlanEvent

        self.db.query(PlanEvent).filter(
            PlanEvent.document_id == doc.id,
            PlanEvent.source == "ai",
        ).delete(synchronize_session=False)
        self.db.flush()

        plan_events = PlanEventService(self.db)
        plan_events.sync_document_summary(doc)
        doc.include_in_calendar = False
        self.db.commit()
        self.db.refresh(doc)

        return {
            "document_id": doc.id,
            "plan_title": doc.plan_title,
            "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
            "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
            "location": None,
            "timeline": [],
            "event_count": 0,
            "needs_review": False,
            "preview_only": False,
            "message": "Đã bỏ kế hoạch này khỏi Lịch hoạt động",
        }

    def confirm_plan_event(
        self,
        doc_id: int,
        *,
        title: Optional[str] = None,
        starts_at=None,
        ends_at=None,
        location: Optional[str] = None,
        timeline: Optional[list] = None,
        include_in_calendar: bool = True,
        event_id: Optional[int] = None,
        events: Optional[list] = None,
    ) -> dict:
        """Persist reviewed calendar package(s) after admin confirm.

        - event_id set → update/remove only that day (edit from Lịch hoạt động)
        - events list → replace AI events with multi-day package (upload review)
        - else → single-event replace (legacy)
        """
        from datetime import datetime as dt

        doc = self.doc_repo.get_by_id(doc_id)
        if not doc:
            raise ValueError("Tài liệu không tồn tại")

        def _coerce_dt(value):
            if value is not None and not isinstance(value, dt):
                return None
            return value

        plan_svc = PlanEventService(self.db)

        # --- Edit one day only ---
        if event_id is not None:
            event = plan_svc.get_by_id(event_id)
            if not event or event.document_id != doc.id:
                raise ValueError("Sự kiện không tồn tại")

            starts_at = _coerce_dt(starts_at)
            ends_at = _coerce_dt(ends_at)
            if starts_at and ends_at and ends_at < starts_at:
                starts_at, ends_at = ends_at, starts_at

            if not include_in_calendar:
                plan_svc.update_event(
                    event,
                    title=event.title,
                    starts_at=event.starts_at or starts_at or dt.utcnow(),
                    ends_at=event.ends_at,
                    location=event.location,
                    include_in_calendar=False,
                )
                self.db.refresh(doc)
                return {
                    "document_id": doc.id,
                    "plan_title": doc.plan_title,
                    "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
                    "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
                    "location": None,
                    "timeline": [],
                    "events": [],
                    "event_count": len(plan_svc.list_for_document(doc.id)),
                    "needs_review": False,
                    "preview_only": False,
                    "message": "Đã bỏ ngày này khỏi Lịch hoạt động",
                }

            if starts_at is None:
                raise ValueError("Cần chọn ngày bắt đầu để đưa kế hoạch lên Lịch hoạt động")

            display_title = (title or event.title or doc.plan_title or doc.filename or "Kế hoạch").strip()
            cleaned_slots = clean_timeline_slots(timeline) or []
            updated = plan_svc.update_event(
                event,
                title=display_title,
                starts_at=starts_at,
                ends_at=ends_at,
                location=location,
                timeline=cleaned_slots,
                include_in_calendar=True,
            )
            self.db.refresh(doc)
            return {
                "document_id": doc.id,
                "plan_title": doc.plan_title,
                "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
                "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
                "location": updated.location if updated else location,
                "timeline": cleaned_slots,
                "events": [],
                "event_count": len(plan_svc.list_for_document(doc.id)),
                "needs_review": False,
                "preview_only": False,
                "message": "Đã lưu sự kiện lên Lịch hoạt động",
            }

        # --- Document-level confirm (upload / replace all AI days) ---
        if not include_in_calendar:
            result = self._remove_document_from_calendar(doc)
            result["events"] = []
            return result

        event_specs: list = []
        if isinstance(events, list) and events:
            for item in events:
                if not isinstance(item, dict):
                    continue
                item_start = _coerce_dt(item.get("starts_at"))
                item_end = _coerce_dt(item.get("ends_at"))
                if item_start and item_end and item_end < item_start:
                    item_start, item_end = item_end, item_start
                if item_start is None:
                    continue
                event_specs.append({
                    "title": (item.get("title") or title or doc.plan_title or doc.filename or "Kế hoạch").strip(),
                    "starts_at": item_start,
                    "ends_at": item_end,
                    "location": item.get("location", location),
                    "timeline": clean_timeline_slots(item.get("timeline")),
                })
        else:
            starts_at = _coerce_dt(starts_at)
            ends_at = _coerce_dt(ends_at)
            if starts_at and ends_at and ends_at < starts_at:
                starts_at, ends_at = ends_at, starts_at
            if starts_at is None:
                raise ValueError("Cần chọn ngày bắt đầu để đưa kế hoạch lên Lịch hoạt động")
            event_specs = [{
                "title": (title or doc.plan_title or doc.filename or "Kế hoạch").strip(),
                "starts_at": starts_at,
                "ends_at": ends_at,
                "location": location,
                "timeline": clean_timeline_slots(timeline),
            }]

        if not event_specs:
            raise ValueError("Cần chọn ngày bắt đầu để đưa kế hoạch lên Lịch hoạt động")

        display_title = (title or event_specs[0]["title"] or doc.plan_title or doc.filename or "Kế hoạch").strip()
        created = plan_svc.replace_ai_events_for_document(
            doc,
            title=display_title,
            events=event_specs,
            include_in_calendar=True,
        )
        self.db.commit()
        self.db.refresh(doc)
        primary = created[0] if created else None
        primary_timeline = clean_timeline_slots(event_specs[0].get("timeline")) or []
        return {
            "document_id": doc.id,
            "plan_title": doc.plan_title,
            "plan_event_at": doc.plan_event_at.isoformat() if doc.plan_event_at else None,
            "plan_event_end_at": doc.plan_event_end_at.isoformat() if doc.plan_event_end_at else None,
            "location": primary.location if primary else location,
            "timeline": primary_timeline,
            "events": serialize_plan_day_packages(
                [
                    PlanDayPackage(
                        start=s["starts_at"],
                        end=s.get("ends_at"),
                        title=s.get("title"),
                        location=s.get("location"),
                        timeline=s.get("timeline"),
                    )
                    for s in event_specs
                ],
                default_title=display_title,
            ),
            "event_count": len(created),
            "needs_review": bool(primary.needs_review) if primary else False,
            "preview_only": False,
            "message": (
                f"Đã lưu {len(created)} sự kiện lên Lịch hoạt động"
                if len(created) > 1
                else "Đã lưu sự kiện lên Lịch hoạt động"
            ),
        }

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
