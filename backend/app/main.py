from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.jobs.openai_cost_scheduler import start_openai_cost_scheduler, stop_openai_cost_scheduler
from app.routers import auth, documents, search, admin, tasks, feedback
from app.models.user import User, UserRole
from app.models.campus import Campus  # noqa: F401 — register ORM tables
from app.models.openai_cost_cache import OpenAICostDaily, OpenAICostSync  # noqa: F401
from app.models.position import Position
from app.models.department import DEFAULT_DEPARTMENTS
from app.repositories.position_repository import PositionRepository
from app.repositories.department_repository import DepartmentRepository
from app.repositories.campus_repository import CampusRepository
from app.utils.auth import hash_password

app = FastAPI(
    title="VABot API",
    description="AI Knowledge Assistant for Việt Anh School",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(admin.router)
app.include_router(tasks.router)
app.include_router(feedback.router)

DEFAULT_ADMIN_EMAIL = "admin@vietanhschool.edu.vn"

DEFAULT_POSITIONS = [
    {
        "name": "Ban giám hiệu",
        "can_upload": True,
        "can_manage_tasks": True,
        "can_delete_documents": True,
        "scope_all_departments": True,
        "sort_order": 1,
    },
    {
        "name": "Tổ trưởng",
        "can_upload": True,
        "can_manage_tasks": True,
        "can_delete_documents": True,
        "scope_all_departments": False,
        "sort_order": 2,
    },
    {
        "name": "Giáo viên",
        "can_upload": False,
        "can_manage_tasks": False,
        "can_delete_documents": False,
        "scope_all_departments": False,
        "sort_order": 3,
    },
]


def _seed_positions(db):
    pos_repo = PositionRepository(db)
    for item in DEFAULT_POSITIONS:
        existing = pos_repo.get_by_name(item["name"])
        if not existing:
            pos_repo.create(**item)


def _migrate_user_positions(db):
    pos_repo = PositionRepository(db)
    default_pos = pos_repo.get_default()
    users = db.query(User).all()
    for user in users:
        if user.position_id:
            if user.position_obj:
                user.position = user.position_obj.name
            continue
        resolved = pos_repo.resolve_by_name(user.position)
        if resolved:
            user.position_id = resolved.id
            user.position = resolved.name
        elif default_pos:
            user.position_id = default_pos.id
            user.position = default_pos.name
    db.commit()


def _seed_departments(db):
    dept_repo = DepartmentRepository(db)
    for i, name in enumerate(DEFAULT_DEPARTMENTS, start=1):
        if not dept_repo.get_by_name(name):
            dept_repo.create(name=name, sort_order=i)


def _migrate_task_departments(db):
    from app.models.task import Task, UNASSIGNED_DEPARTMENT
    from app.models.user import User

    tasks = db.query(Task).filter(
        (Task.department.is_(None)) | (Task.department == "")
    ).all()
    if not tasks:
        return
    for task in tasks:
        dept = UNASSIGNED_DEPARTMENT
        if task.assignee_id:
            user = db.query(User).filter(User.id == task.assignee_id).first()
            if user and user.department:
                dept = user.department
        task.department = dept
    db.commit()


def _migrate_user_departments(db):
    dept_repo = DepartmentRepository(db)
    users = db.query(User).all()
    for user in users:
        if user.department_id:
            dept = dept_repo.get_by_id(user.department_id)
            if dept:
                user.department = dept.name
            continue
        if user.department:
            resolved = dept_repo.resolve_by_name(user.department)
            if resolved:
                user.department_id = resolved.id
                user.department = resolved.name
    db.commit()


def _seed_admin_user(db):
    if db.query(User).filter(User.role == UserRole.admin).first():
        return

    admin_user = db.query(User).filter(User.email == DEFAULT_ADMIN_EMAIL).first()
    if admin_user:
        admin_user.role = UserRole.admin
        db.commit()
        return

    db.add(
        User(
            name="Admin",
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hash_password("admin123"),
            role=UserRole.admin,
            must_change_password=True,
        )
    )
    db.commit()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text, inspect
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        user_columns = [c["name"] for c in inspector.get_columns("users")]
        if "department" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN department VARCHAR(255)"))
            db.commit()

        if "nickname" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(100)"))
            db.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_nickname "
                "ON users (nickname) WHERE nickname IS NOT NULL"
            ))
            db.commit()

        if "position" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN position VARCHAR(255)"))
            db.commit()

        if "position_id" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN position_id INTEGER REFERENCES positions(id)"))
            db.commit()

        if "department_id" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id)"))
            db.commit()

        if "must_change_password" not in user_columns:
            db.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE"))
            db.execute(text("UPDATE users SET must_change_password = TRUE"))
            db.commit()

        doc_columns = [c["name"] for c in inspector.get_columns("documents")]
        if "department" not in doc_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN department VARCHAR(255)"))
            db.execute(text("ALTER TABLE documents ADD COLUMN month INTEGER"))
            db.execute(text("ALTER TABLE documents ADD COLUMN school_year VARCHAR(20)"))
            db.commit()

        if "plan_title" not in doc_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN plan_title VARCHAR(500)"))
            db.commit()

        doc_columns = [c["name"] for c in inspector.get_columns("documents")]
        if "plan_event_at" not in doc_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN plan_event_at TIMESTAMPTZ"))
            db.commit()

        doc_columns = [c["name"] for c in inspector.get_columns("documents")]
        if "plan_event_end_at" not in doc_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN plan_event_end_at TIMESTAMPTZ"))
            db.commit()

        task_columns = [c["name"] for c in inspector.get_columns("tasks")]
        if "department" not in task_columns:
            db.execute(text("ALTER TABLE tasks ADD COLUMN department VARCHAR(255)"))
            db.commit()
        if "created_by_id" not in task_columns:
            db.execute(text("ALTER TABLE tasks ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
            db.commit()
        if "has_scheduled_time" not in task_columns:
            db.execute(text("ALTER TABLE tasks ADD COLUMN has_scheduled_time BOOLEAN DEFAULT FALSE"))
            db.commit()

        _seed_positions(db)
        _seed_departments(db)
        CampusRepository(db).seed_defaults()
        _migrate_user_positions(db)
        _migrate_user_departments(db)
        _migrate_task_departments(db)

        _seed_admin_user(db)
    finally:
        db.close()

    start_openai_cost_scheduler()


@app.on_event("shutdown")
def shutdown():
    stop_openai_cost_scheduler()


@app.get("/health")
def health():
    return {"status": "ok", "service": "VABot API"}
