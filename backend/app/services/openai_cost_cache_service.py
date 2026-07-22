import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.openai_cost_cache import OpenAICostDaily, OpenAICostSync
from app.services.openai_billing_service import fetch_openai_daily_cost_rows

logger = logging.getLogger(__name__)

SYNC_META_ID = 1
DEFAULT_SYNC_DAYS = 365


class OpenAICostCacheService:
    def __init__(self, db: Session):
        self.db = db

    def get_sync_meta(self) -> Optional[OpenAICostSync]:
        return self.db.query(OpenAICostSync).filter(OpenAICostSync.id == SYNC_META_ID).first()

    def _ensure_sync_meta(self) -> OpenAICostSync:
        meta = self.get_sync_meta()
        if meta is None:
            meta = OpenAICostSync(id=SYNC_META_ID)
            self.db.add(meta)
            self.db.flush()
        return meta

    def has_cached_data(self) -> bool:
        return self.db.query(OpenAICostDaily.id).limit(1).first() is not None

    def get_costs_for_range(self, start_dt: datetime, end_dt: datetime) -> dict:
        start_date = start_dt.date()
        end_date = end_dt.date()
        meta = self.get_sync_meta()
        synced_at = meta.last_sync_at if meta else None

        if not self.has_cached_data():
            return {
                "cost_usd": None,
                "line_items": None,
                "source": "internal",
                "note": "Chưa có dữ liệu chi phí OpenAI. Nhấn «Cập nhật chi phí OpenAI» để đồng bộ.",
                "synced_at": synced_at,
            }

        rows = (
            self.db.query(
                OpenAICostDaily.line_item,
                func.sum(OpenAICostDaily.cost_usd).label("total"),
            )
            .filter(
                OpenAICostDaily.cost_date >= start_date,
                OpenAICostDaily.cost_date <= end_date,
            )
            .group_by(OpenAICostDaily.line_item)
            .all()
        )

        line_item_totals: dict[str, float] = defaultdict(float)
        for row in rows:
            line_item_totals[row.line_item] += float(row.total or 0.0)

        total_usd = sum(line_item_totals.values())
        line_items = [
            {"line_item": name, "cost_usd": round(cost, 6)}
            for name, cost in sorted(line_item_totals.items(), key=lambda x: (-x[1], x[0]))
            if cost > 0
        ]

        note = None
        if meta and meta.last_sync_status == "error" and meta.last_sync_error:
            note = f"Lần đồng bộ gần nhất lỗi: {meta.last_sync_error}"

        return {
            "cost_usd": round(total_usd, 6),
            "line_items": line_items or None,
            "source": "openai_billing",
            "note": note,
            "synced_at": synced_at,
        }

    def refresh_from_openai(self, days: int = DEFAULT_SYNC_DAYS) -> dict:
        meta = self._ensure_sync_meta()

        if not settings.OPENAI_ADMIN_API_KEY:
            meta.last_sync_status = "error"
            meta.last_sync_error = "Chưa cấu hình OPENAI_ADMIN_API_KEY"
            meta.last_sync_at = datetime.now(timezone.utc)
            self.db.commit()
            return {
                "ok": False,
                "message": meta.last_sync_error,
                "synced_at": meta.last_sync_at,
                "rows_upserted": 0,
            }

        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)

        try:
            daily_rows = fetch_openai_daily_cost_rows(start_dt, end_dt)
        except Exception as exc:
            logger.warning("OpenAI cost refresh failed: %s", exc)
            meta.last_sync_status = "error"
            meta.last_sync_error = str(exc)[:500]
            meta.last_sync_at = datetime.now(timezone.utc)
            self.db.commit()
            return {
                "ok": False,
                "message": meta.last_sync_error,
                "synced_at": meta.last_sync_at,
                "rows_upserted": 0,
            }

        sync_start_date = start_dt.date()
        sync_end_date = end_dt.date()

        self.db.query(OpenAICostDaily).filter(
            OpenAICostDaily.cost_date >= sync_start_date,
            OpenAICostDaily.cost_date <= sync_end_date,
        ).delete(synchronize_session=False)

        for row in daily_rows:
            self.db.add(
                OpenAICostDaily(
                    cost_date=row["cost_date"],
                    line_item=row["line_item"],
                    cost_usd=row["cost_usd"],
                )
            )

        upserted = len(daily_rows)

        meta.last_sync_at = datetime.now(timezone.utc)
        meta.last_sync_status = "ok"
        meta.last_sync_error = None
        self.db.commit()

        total_usd = sum(r["cost_usd"] for r in daily_rows)
        return {
            "ok": True,
            "message": f"Đã đồng bộ {upserted} dòng chi phí ({days} ngày gần nhất).",
            "synced_at": meta.last_sync_at,
            "rows_upserted": upserted,
            "total_usd_synced": round(total_usd, 6),
        }
