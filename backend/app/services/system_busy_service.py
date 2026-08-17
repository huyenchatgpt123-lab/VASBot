"""Track long-running system jobs so clients can show a specific busy banner."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.system_busy import SystemBusyState

JOB_IMPORT_TIMETABLE = "import_timetable"
JOB_IMPORT_USERS = "import_users"

JOB_MESSAGES = {
    JOB_IMPORT_TIMETABLE: (
        "Đang import thời khóa biểu — TKB có thể thay đổi, vui lòng đợi."
    ),
    JOB_IMPORT_USERS: (
        "Đang import danh sách giáo viên — vui lòng đợi."
    ),
}

# Auto-clear stuck flags (server crash mid-import)
STALE_AFTER = timedelta(minutes=45)


def _get_or_create(db: Session) -> SystemBusyState:
    row = db.query(SystemBusyState).filter(SystemBusyState.id == 1).first()
    if not row:
        row = SystemBusyState(id=1, busy=False)
        db.add(row)
        db.flush()
    return row


def set_busy(
    db: Session,
    job: str,
    *,
    message: Optional[str] = None,
    started_by_id: Optional[int] = None,
) -> dict:
    row = _get_or_create(db)
    row.busy = True
    row.job = job
    row.message = (message or JOB_MESSAGES.get(job) or "Đang cập nhật dữ liệu…")[:300]
    row.started_at = datetime.now(timezone.utc)
    row.started_by_id = started_by_id
    db.commit()
    return get_status(db)


def clear_busy(db: Session, job: Optional[str] = None) -> dict:
    row = _get_or_create(db)
    if job and row.job and row.job != job:
        return get_status(db)
    row.busy = False
    row.job = None
    row.message = None
    row.started_at = None
    row.started_by_id = None
    db.commit()
    return get_status(db)


def get_status(db: Session) -> dict:
    row = db.query(SystemBusyState).filter(SystemBusyState.id == 1).first()
    if not row or not row.busy:
        return {
            "busy": False,
            "job": None,
            "message": None,
            "started_at": None,
        }

    started = row.started_at
    if started and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if started and datetime.now(timezone.utc) - started > STALE_AFTER:
        row.busy = False
        row.job = None
        row.message = None
        row.started_at = None
        row.started_by_id = None
        db.commit()
        return {
            "busy": False,
            "job": None,
            "message": None,
            "started_at": None,
        }

    return {
        "busy": True,
        "job": row.job,
        "message": row.message or JOB_MESSAGES.get(row.job or "", "Đang cập nhật dữ liệu…"),
        "started_at": row.started_at,
    }
