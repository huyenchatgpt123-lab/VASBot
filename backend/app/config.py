from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://vabot:vabot123@localhost:5432/vabot"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    OPENAI_API_KEY: str = ""
    OPENAI_ADMIN_API_KEY: str = ""
    OPENAI_ORG_ID: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # Short-lived token for document preview/download links (not the session JWT)
    DOC_ACCESS_TOKEN_EXPIRE_MINUTES: int = 5
    # Comma-separated browser origins allowed for CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
    # Max upload size (documents, Excel imports) — 20 MiB
    MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024
    # Login rate limit: N requests / window (slowapi format)
    LOGIN_RATE_LIMIT: str = "10/15minutes"
    UPLOAD_DIR: str = "./uploads"
    FAISS_DIR: str = "./faiss_data"
    STORAGE_BACKEND: str = "local"
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CHUNK_SIZE: int = 1200
    CHUNK_OVERLAP: int = 250
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSION: int = 3072
    EMBEDDING_COST_PER_1M: float = 0.13
    USD_TO_VND: float = 25000.0
    CHAT_MODEL: str = "gpt-4.1"
    REWRITE_MODEL: str = "gpt-4.1-nano"

    # Notification email — default Microsoft Graph (HTTPS). Set MAIL_PROVIDER=smtp for SMTP.
    MAIL_ENABLED: bool = False
    MAIL_PROVIDER: str = "graph"
    MAIL_FROM: str = ""
    MAIL_FROM_NAME: str = "VATask"
    FRONTEND_URL: str = ""
    # Microsoft Graph (application permission Mail.Send)
    GRAPH_TENANT_ID: str = ""
    GRAPH_CLIENT_ID: str = ""
    GRAPH_CLIENT_SECRET: str = ""
    # Optional SMTP fallback (Render paid / VPS that allow port 587)
    MAIL_HOST: str = "smtp.office365.com"
    MAIL_PORT: int = 587
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""

    # Web Push (PWA) — off until PUSH_ENABLED=true and VAPID keys are set
    PUSH_ENABLED: bool = False
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@vietanhschool.edu.vn"

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def mail_from_address(self) -> str:
        return (self.MAIL_FROM or self.MAIL_USERNAME or "").strip()

    @property
    def frontend_base_url(self) -> str:
        url = (self.FRONTEND_URL or "").strip().rstrip("/")
        if url:
            return url
        origins = self.cors_origins_list
        return origins[0].rstrip("/") if origins else ""


settings = Settings()

INSECURE_DEFAULT_SECRET = "your-super-secret-key-change-in-production"
