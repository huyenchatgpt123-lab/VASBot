import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.plan_event import PlanEvent

logger = logging.getLogger(__name__)


class PlanEventService:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, event_id: int) -> Optional[PlanEvent]:
        return self.db.query(PlanEvent).filter(PlanEvent.id == event_id).first()

    def update_event(
        self,
        event: PlanEvent,
        *,
        title: str,
        starts_at: datetime,
        ends_at: Optional[datetime] = None,
    ) -> PlanEvent:
        title = title.strip()
        if not title:
            raise ValueError("Tiêu đề không được để trống")
        if len(title) > 500:
            title = title[:500]

        if ends_at and starts_at and ends_at < starts_at:
            starts_at, ends_at = ends_at, starts_at

        # Same-day end with only date (00:00) → treat as multi-day end; keep as-is.
        event.title = title
        event.starts_at = starts_at
        event.ends_at = ends_at
        event.source = "manual"
        event.needs_review = False

        document = event.document or self.db.query(Document).filter(Document.id == event.document_id).first()
        if document:
            document.include_in_calendar = True
            self.sync_document_summary(document)

        self.db.commit()
        self.db.refresh(event)
        return event

    def create_manual_event(
        self,
        document: Document,
        *,
        title: str,
        starts_at: datetime,
        ends_at: Optional[datetime] = None,
    ) -> PlanEvent:
        title = title.strip()
        if not title:
            raise ValueError("Tiêu đề không được để trống")
        if len(title) > 500:
            title = title[:500]
        if ends_at and starts_at and ends_at < starts_at:
            starts_at, ends_at = ends_at, starts_at

        event = PlanEvent(
            document_id=document.id,
            title=title,
            starts_at=starts_at,
            ends_at=ends_at,
            source="manual",
            needs_review=False,
        )
        self.db.add(event)
        document.include_in_calendar = True
        self.db.flush()
        self.sync_document_summary(document)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_for_document(self, document_id: int) -> List[PlanEvent]:
        return (
            self.db.query(PlanEvent)
            .filter(PlanEvent.document_id == document_id)
            .order_by(PlanEvent.starts_at.nullsfirst(), PlanEvent.id)
            .all()
        )

    def replace_ai_events_for_document(
        self,
        document: Document,
        *,
        title: Optional[str],
        starts_at: Optional[datetime],
        ends_at: Optional[datetime],
        include_in_calendar: bool = True,
    ) -> List[PlanEvent]:
        """
        Phase 1: replace AI-sourced events with a single extracted event (or a review placeholder).
        Manual events are preserved for later phases.
        """
        self.db.query(PlanEvent).filter(
            PlanEvent.document_id == document.id,
            PlanEvent.source == "ai",
        ).delete(synchronize_session=False)

        display_title = (title or document.plan_title or document.filename or "Kế hoạch").strip()
        if len(display_title) > 500:
            display_title = display_title[:500]

        needs_review = starts_at is None
        event = PlanEvent(
            document_id=document.id,
            title=display_title,
            starts_at=starts_at,
            ends_at=ends_at if starts_at else None,
            source="ai",
            needs_review=needs_review,
        )
        self.db.add(event)

        document.include_in_calendar = include_in_calendar
        document.plan_title = title or document.plan_title
        document.plan_event_at = starts_at
        document.plan_event_end_at = ends_at if starts_at else None

        self.db.flush()
        return [event]

    def sync_document_summary(self, document: Document) -> None:
        """Keep denormalized document.plan_* columns in sync with plan_events (Documents page)."""
        events = self.list_for_document(document.id)
        dated = [e for e in events if e.starts_at is not None]
        if dated:
            primary = min(dated, key=lambda e: e.starts_at)
            document.plan_event_at = primary.starts_at
            document.plan_event_end_at = primary.ends_at
            if primary.title:
                document.plan_title = primary.title
        elif events:
            document.plan_event_at = None
            document.plan_event_end_at = None
            if events[0].title:
                document.plan_title = events[0].title
        else:
            document.plan_event_at = None
            document.plan_event_end_at = None

    def migrate_from_documents(self) -> int:
        """One-time: create plan_events from legacy document.plan_event_* columns."""
        existing_doc_ids = {
            row[0]
            for row in self.db.query(PlanEvent.document_id).distinct().all()
        }
        docs = self.db.query(Document).all()
        created = 0
        for doc in docs:
            if doc.id in existing_doc_ids:
                # Still ensure include_in_calendar for docs that already have events
                if not doc.include_in_calendar:
                    has_events = (
                        self.db.query(PlanEvent.id)
                        .filter(PlanEvent.document_id == doc.id)
                        .limit(1)
                        .first()
                    )
                    if has_events:
                        doc.include_in_calendar = True
                continue

            if not doc.plan_event_at and not doc.plan_title:
                continue

            title = (doc.plan_title or doc.filename or "Kế hoạch").strip()[:500]
            if doc.plan_event_at:
                self.db.add(
                    PlanEvent(
                        document_id=doc.id,
                        title=title,
                        starts_at=doc.plan_event_at,
                        ends_at=doc.plan_event_end_at,
                        source="ai",
                        needs_review=False,
                    )
                )
                doc.include_in_calendar = True
                created += 1
            elif doc.plan_title:
                # Title only — mark for review if we ever opt them in later; skip calendar for now
                pass

        self.db.commit()
        logger.info("Migrated %s plan_events from documents", created)
        return created
