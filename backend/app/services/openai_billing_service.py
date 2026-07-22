import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger(__name__)

OPENAI_COSTS_URL = "https://api.openai.com/v1/organization/costs"


def _utc_midnight(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)


def _date_range_timestamps(start_dt: datetime, end_dt: datetime) -> tuple[int, int]:
    start_ts = int(_utc_midnight(start_dt).timestamp())
    end_exclusive = _utc_midnight(end_dt) + timedelta(days=1)
    end_ts = int(end_exclusive.timestamp())
    return start_ts, end_ts


def _request_costs_page(params: list[tuple[str, str]]) -> dict:
    url = f"{OPENAI_COSTS_URL}?{urlencode(params)}"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_ADMIN_API_KEY}",
        "Content-Type": "application/json",
    }
    if settings.OPENAI_ORG_ID:
        headers["OpenAI-Organization"] = settings.OPENAI_ORG_ID

    request = Request(url, headers=headers, method="GET")
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _iter_cost_buckets(start_dt: datetime, end_dt: datetime):
    """Yield (cost_date, line_item, cost_usd) from OpenAI Costs API. Raises on HTTP errors."""
    start_ts, end_ts = _date_range_timestamps(start_dt, end_dt)
    base_params: list[tuple[str, str]] = [
        ("start_time", str(start_ts)),
        ("end_time", str(end_ts)),
        ("bucket_width", "1d"),
        ("limit", "180"),
        ("group_by", "line_item"),
    ]

    page: Optional[str] = None
    while True:
        params = list(base_params)
        if page:
            params.append(("page", page))

        payload = _request_costs_page(params)

        for bucket in payload.get("data", []):
            start_time = bucket.get("start_time")
            if start_time is None:
                continue
            cost_date = datetime.fromtimestamp(int(start_time), tz=timezone.utc).date()
            for result in bucket.get("result", []):
                if result.get("object") != "organization.costs.result":
                    continue
                amount = result.get("amount") or {}
                if str(amount.get("currency", "")).lower() != "usd":
                    continue
                value = float(amount.get("value") or 0.0)
                if value <= 0:
                    continue
                line_item = result.get("line_item") or "other"
                yield cost_date, line_item, value

        if not payload.get("has_more"):
            break
        page = payload.get("next_page")
        if not page:
            break


def fetch_openai_daily_cost_rows(start_dt: datetime, end_dt: datetime) -> list[dict]:
    """
    Fetch per-day line items from OpenAI billing API.
    Returns empty list when admin key is missing; raises on HTTP errors.
    """
    if not settings.OPENAI_ADMIN_API_KEY:
        return []

    rows: list[dict] = []
    for cost_date, line_item, value in _iter_cost_buckets(start_dt, end_dt):
        rows.append(
            {
                "cost_date": cost_date,
                "line_item": line_item,
                "cost_usd": round(value, 6),
            }
        )
    return rows


def fetch_openai_invoice_costs(start_dt: datetime, end_dt: datetime) -> Optional[dict]:
    """
    Fetch organization costs from OpenAI billing API for the given date range.
    Returns None when admin key is missing; raises on HTTP errors (caller may fallback).
    """
    if not settings.OPENAI_ADMIN_API_KEY:
        return None

    line_item_totals: dict[str, float] = defaultdict(float)
    total_usd = 0.0
    for _cost_date, line_item, value in _iter_cost_buckets(start_dt, end_dt):
        line_item_totals[line_item] += value
        total_usd += value

    line_items = [
        {"line_item": name, "cost_usd": round(cost, 6)}
        for name, cost in sorted(line_item_totals.items(), key=lambda x: (-x[1], x[0]))
        if cost > 0
    ]

    return {
        "cost_usd": round(total_usd, 6),
        "line_items": line_items,
        "source": "openai_billing",
    }


def get_openai_costs_for_dashboard(start_dt: datetime, end_dt: datetime) -> dict:
    """
    Primary: OpenAI invoice (Organization Costs API).
    Fallback: caller supplies internal estimate when this returns source=internal.
    """
    if not settings.OPENAI_ADMIN_API_KEY:
        return {
            "cost_usd": None,
            "line_items": None,
            "source": "internal",
            "note": "Chưa cấu hình OPENAI_ADMIN_API_KEY — hiển thị ước tính nội bộ (chỉ embedding đã ghi log).",
        }

    try:
        billing = fetch_openai_invoice_costs(start_dt, end_dt)
        if billing is None:
            return {
                "cost_usd": None,
                "line_items": None,
                "source": "internal",
                "note": "Không lấy được dữ liệu hóa đơn OpenAI.",
            }
        return {**billing, "note": None}
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        logger.warning("OpenAI costs API HTTP %s: %s", exc.code, body)
        return {
            "cost_usd": None,
            "line_items": None,
            "source": "internal",
            "note": f"Không gọi được OpenAI Costs API (HTTP {exc.code}). Đang dùng ước tính nội bộ.",
        }
    except (URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        logger.warning("OpenAI costs API error: %s", exc)
        return {
            "cost_usd": None,
            "line_items": None,
            "source": "internal",
            "note": "Lỗi khi lấy hóa đơn OpenAI. Đang dùng ước tính nội bộ.",
        }
