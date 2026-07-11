from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.routers import auth, documents, search, admin, tasks, feedback
from app.models.user import User, UserRole
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

        doc_columns = [c["name"] for c in inspector.get_columns("documents")]
        if "department" not in doc_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN department VARCHAR(255)"))
            db.execute(text("ALTER TABLE documents ADD COLUMN month INTEGER"))
            db.execute(text("ALTER TABLE documents ADD COLUMN school_year VARCHAR(20)"))
            db.commit()

        admin_user = db.query(User).filter(User.email == "admin@vietanh.edu.vn").first()
        if not admin_user:
            admin_user = User(
                name="Admin",
                nickname="Admin",
                email="admin@vietanh.edu.vn",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
            )
            db.add(admin_user)
            db.commit()
        elif admin_user.nickname is None:
            admin_user.nickname = "Admin"
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "VABot API"}
