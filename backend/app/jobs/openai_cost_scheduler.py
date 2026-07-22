import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.database import SessionLocal
from app.services.openai_cost_cache_service import OpenAICostCacheService

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_daily_openai_cost_sync() -> None:
    db = SessionLocal()
    try:
        result = OpenAICostCacheService(db).refresh_from_openai()
        if result.get("ok"):
            logger.info("Scheduled OpenAI cost sync OK: %s", result.get("message"))
        else:
            logger.warning("Scheduled OpenAI cost sync failed: %s", result.get("message"))
    except Exception:
        logger.exception("Scheduled OpenAI cost sync crashed")
    finally:
        db.close()


def start_openai_cost_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = BackgroundScheduler(timezone=ZoneInfo("Asia/Ho_Chi_Minh"))
    scheduler.add_job(
        _run_daily_openai_cost_sync,
        CronTrigger(hour=0, minute=0, timezone=ZoneInfo("Asia/Ho_Chi_Minh")),
        id="openai_cost_daily_sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("OpenAI cost scheduler started (daily 00:00 Asia/Ho_Chi_Minh)")
    return scheduler


def stop_openai_cost_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
