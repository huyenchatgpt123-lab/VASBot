"""Schema sync for timetable / substitute module.

Kept out of main.py so startup stays readable. Follows the project's
existing create_all + ALTER TABLE style (no Alembic migration yet).
"""
import logging

from sqlalchemy import text, inspect
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def sync_timetable_schema(db: Session, engine) -> None:
    inspector = inspect(engine)

    user_columns = [c["name"] for c in inspector.get_columns("users")]
    if "teacher_code" not in user_columns:
        db.execute(text("ALTER TABLE users ADD COLUMN teacher_code VARCHAR(50)"))
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_teacher_code "
            "ON users (teacher_code) WHERE teacher_code IS NOT NULL"
        ))
        db.commit()
        logger.info("Added users.teacher_code")

    user_columns = [c["name"] for c in inspector.get_columns("users")]
    if "campus_id" not in user_columns:
        db.execute(text(
            "ALTER TABLE users ADD COLUMN campus_id INTEGER REFERENCES campuses(id)"
        ))
        db.commit()
        logger.info("Added users.campus_id")

    # Tables classes / timetable_slots / substitute_assignments are created via
    # Base.metadata.create_all when models are imported before startup.
