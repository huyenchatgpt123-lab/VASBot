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

    if inspector.has_table("substitute_assignments"):
        sub_columns = {c["name"] for c in inspector.get_columns("substitute_assignments")}
        alter_cols = [
            ("confirmed_at", "TIMESTAMP WITH TIME ZONE"),
            ("confirmed_by_id", "INTEGER REFERENCES users(id)"),
            ("rejection_reason", "VARCHAR(500)"),
            ("cancel_reason", "VARCHAR(500)"),
        ]
        for col_name, col_type in alter_cols:
            if col_name not in sub_columns:
                db.execute(text(
                    f"ALTER TABLE substitute_assignments ADD COLUMN {col_name} {col_type}"
                ))
                logger.info("Added substitute_assignments.%s", col_name)

        # Legacy status "assigned" → treat as already confirmed (do not re-prompt teachers)
        db.execute(text(
            "UPDATE substitute_assignments SET status = 'confirmed' "
            "WHERE status = 'assigned'"
        ))
        db.commit()
