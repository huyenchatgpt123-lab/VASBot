from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://vabot:vabot123@localhost:5432/vabot"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    OPENAI_API_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    UPLOAD_DIR: str = "./uploads"
    FAISS_DIR: str = "./faiss_data"
    CHUNK_SIZE: int = 1200
    CHUNK_OVERLAP: int = 250
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSION: int = 3072
    CHAT_MODEL: str = "gpt-4.1"
    REWRITE_MODEL: str = "gpt-4.1-nano"

    class Config:
        env_file = ".env"


settings = Settings()
