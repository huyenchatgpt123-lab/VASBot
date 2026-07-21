from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://vabot:vabot123@localhost:5432/vabot"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    OPENAI_API_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
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

    class Config:
        env_file = ".env"


settings = Settings()
