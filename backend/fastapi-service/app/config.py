"""Environment-driven settings for the intelligence service."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongo_uri: str = "mongodb://127.0.0.1:27017/agriqueue"
    mongo_db_name: str = "agriqueue"
    port: int = 8000
    environment: str = "development"
    internal_api_key: str = "agriqueue-internal-key"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    express_url: str = "http://localhost:5000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
