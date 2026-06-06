from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Phoenix ERP
    phoenix_api_base_url: str = "http://host.docker.internal:8000"
    phoenix_api_token: str = ""

    # SSH
    ssh_private_key_path: str = "/keys/id_rsa"
    ssh_username: str = "azureuser"
    ssh_connect_timeout: int = 10
    ssh_command_timeout: int = 60

    # Database
    database_url: str = "postgresql+asyncpg://autopilot:autopilot@postgres:5432/autopilot"

    # LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"


@lru_cache
def get_settings() -> Settings:
    return Settings()
