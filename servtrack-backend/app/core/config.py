from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    PII_ENCRYPTION_KEY: str | None = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    INVITE_TOKEN_EXPIRE_MINUTES: int = 10080
    APP_ENV: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"
    MAIL_FROM: str = "no-reply@servtrack.local"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    TWILIO_VERIFY_ENABLED: bool = False
    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_VERIFY_SERVICE_SID: str | None = None
    TWILIO_VERIFY_CHANNEL: str = "sms"
    SMS_PROVIDER: str | None = None
    EXOTEL_SID: str | None = None
    EXOTEL_ACCOUNT_SID: str | None = None
    EXOTEL_API_KEY: str | None = None
    EXOTEL_API_TOKEN: str | None = None
    EXOTEL_SENDER_ID: str | None = None
    EXOTEL_SUBDOMAIN: str = "api.in.exotel.com"
    EXOTEL_DLT_ENTITY_ID: str | None = None
    EXOTEL_DLT_TEMPLATE_ID: str | None = None
    EXOTEL_SMS_TYPE: str = "transactional"
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 5
    MAX_WORK_ORDER_PHOTOS: int = 5
    DB_POOL_SIZE: int = 3
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_TIMEOUT: int = 15
    DB_POOL_RECYCLE_SECONDS: int = 1800

    @property
    def origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def exotel_account_sid(self) -> str | None:
        return self.EXOTEL_ACCOUNT_SID or self.EXOTEL_SID

    class Config:
        env_file = ".env"


settings = Settings()
