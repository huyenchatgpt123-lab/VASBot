import logging
import re
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.plan_event import PlanEvent

logger = logging.getLogger(__name__)

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def _as_naive(value: Optional[datetime]) -> Optional[datetime]:
    """Strip tzinfo so DB-aware and form-naive datetimes can be compared safely."""
    if value is None:
        return None
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=None) if value.tzinfo else value


def clean_timeline_slots(timeline: Optional[list]) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(timeline, list):
        return None
    cleaned: List[Dict[str, Any]] = []
    for item in timeline:
        if not isinstance(item, dict):
            continue
        start = str(item.get("start") or "").strip()
        end = str(item.get("end") or "").strip()
        slot_title = str(item.get("title") or "").strip()
        if not _TIME_RE.fullmatch(start) or not slot_title:
            continue
        if not _TIME_RE.fullmatch(end):
            end = ""
        cleaned.append({
            "start": start,
            "end": end or None,
            "title": slot_title[:60],
        })
    cleaned.sort(key=lambda s: (s["start"], s["end"] or ""))
    return cleaned or None


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
        location: Optional[str] = None,
        timeline: Optional[list] = None,
        include_in_calendar: bool = True,
    ) -> Optional[PlanEvent]:
        document = event.document or self.db.query(Document).filter(Document.id == event.document_id).first()

        if not include_in_calendar:
            self.db.delete(event)
            self.db.flush()
            if document:
                remaining = self.list_for_document(document.id)
                if not remaining:
                    document.include_in_calendar = False
                self.sync_document_summary(document)
            self.db.commit()
            return None

        title = title.strip()
        if not title:
            raise ValueError("Tiêu đề không được để trống")
        if len(title) > 500:
            title = title[:500]

        starts_at = _as_naive(starts_at)
        ends_at = _as_naive(ends_at)
        if ends_at and starts_at and ends_at < starts_at:
            starts_at, ends_at = ends_at, starts_at

        loc = (location or "").strip()
        if len(loc) > 300:
            loc = loc[:300]

        event.title = title
        event.location = loc or None
        event.starts_at = starts_at
        event.ends_at = ends_at
        if timeline is not None:
            event.timeline = clean_timeline_slots(timeline)
        event.source = "manual"
        event.needs_review = False

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
        location: Optional[str] = None,
        timeline: Optional[list] = None,
    ) -> PlanEvent:
        title = title.strip()
        if not title:
            raise ValueError("Tiêu đề không được để trống")
        if len(title) > 500:
            title = title[:500]

        starts_at = _as_naive(starts_at)
        ends_at = _as_naive(ends_at)
        if ends_at and starts_at and ends_at < starts_at:
            starts_at, ends_at = ends_at, starts_at

        loc = (location or "").strip()
        if len(loc) > 300:
            loc = loc[:300]

        event = PlanEvent(
            document_id=document.id,
            title=title,
            location=loc or None,
            timeline=clean_timeline_slots(timeline),
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
        title: Optional[str] = None,
        starts_at: Optional[datetime] = None,
        ends_at: Optional[datetime] = None,
        include_in_calendar: bool = True,
        location: Optional[str] = None,
        timeline: Optional[List[Dict[str, Any]]] = None,
        events: Optional[List[Dict[str, Any]]] = None,
    ) -> List[PlanEvent]:
        """
        Replace AI-sourced events. Accepts either a single event (legacy kwargs)
        or an `events` list for multi-day / non-contiguous packages.
        Manual events are preserved.
        """
        self.db.query(PlanEvent).filter(
            PlanEvent.document_id == document.id,
            PlanEvent.source == "ai",
        ).delete(synchronize_session=False)

        default_title = (title or document.plan_title or document.filename or "Kế hoạch").strip()
        if len(default_title) > 500:
            default_title = default_title[:500]

        specs: List[Dict[str, Any]] = []
        if events:
            specs = list(events)
        elif starts_at is not None or default_title:
            specs = [{
                "title": default_title,
                "starts_at": starts_at,
                "ends_at": ends_at,
                "location": location,
                "timeline": timeline,
            }]

        created: List[PlanEvent] = []
        for spec in specs:
            if not isinstance(spec, dict):
                continue
            spec_start = _as_naive(spec.get("starts_at"))
            spec_end = _as_naive(spec.get("ends_at"))
            if spec_start and spec_end and spec_end < spec_start:
                spec_start, spec_end = spec_end, spec_start
            display_title = (spec.get("title") or default_title or "Kế hoạch").strip()[:500]
            loc = (spec.get("location") if spec.get("location") is not None else location) or ""
            loc = str(loc).strip()[:300]
            slots = clean_timeline_slots(spec.get("timeline") if "timeline" in spec else timeline)
            needs_review = spec_start is None
            event = PlanEvent(
                document_id=document.id,
                title=display_title,
                location=loc or None,
                timeline=slots,
                starts_at=spec_start,
                ends_at=spec_end if spec_start else None,
                source="ai",
                needs_review=needs_review,
            )
            self.db.add(event)
            created.append(event)

        document.include_in_calendar = include_in_calendar
        if title:
            document.plan_title = title
        self.db.flush()
        self.sync_document_summary(document)
        return created

    def sync_document_summary(self, document: Document) -> None:
        """Keep denormalized document.plan_* columns in sync with plan_events (Documents page)."""
        events = self.list_for_document(document.id)
        dated = [e for e in events if e.starts_at is not None]
        if dated:
            # Normalize before min/max — DB may return aware while new rows are naive.
            primary = min(dated, key=lambda e: _as_naive(e.starts_at) or datetime.min)
            latest_end = max(
                (
                    _as_naive(e.ends_at) or _as_naive(e.starts_at)
                    for e in dated
                    if e.starts_at is not None
                ),
                default=None,
            )
            primary_start = _as_naive(primary.starts_at)
            document.plan_event_at = primary_start
            if latest_end and primary_start and latest_end.date() > primary_start.date():
                document.plan_event_end_at = latest_end
            else:
                document.plan_event_end_at = _as_naive(primary.ends_at)
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
                        starts_at=_as_naive(doc.plan_event_at),
                        ends_at=_as_naive(doc.plan_event_end_at),
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
