"""Open WebUI local management models.

Represents the configuration, status, and environment of the locally
running Open WebUI instance managed as a subprocess.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class OpenWebuiStatus(StrEnum):
    """Lifecycle states of the local Open WebUI process."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"
    NOT_INSTALLED = "not_installed"


class OpenWebuiEnvConfig(BaseModel):
    """Environment variables passed to the Open WebUI subprocess.

    These can be changed at runtime — changing them triggers a restart.
    """

    ollama_base_urls: str = Field(
        default="",
        description=(
            "Semicolon-separated Ollama API base URLs. "
            "Points to the provisioned remote Ollama server."
        ),
    )
    port: int = Field(
        default=8080,
        ge=1024,
        le=65535,
        description="Port Open WebUI listens on",
    )
    data_dir: str = Field(
        default="/app/open-webui-data",
        description="Directory for Open WebUI persistent data (DB, uploads)",
    )

    # Optional overrides
    webui_name: str = Field(
        default="PrivateAI Chat",
        description="Display name shown in the Open WebUI header",
    )
    webui_auth: bool = Field(
        default=False,
        description="Enable authentication (False = single-user, no login screen)",
    )
    enable_signup: bool = Field(
        default=True,
        description="Allow new users to register (only if webui_auth=True)",
    )
    default_models: str = Field(
        default="",
        description="Default model for new conversations",
    )
    webui_secret_key: str = Field(
        default="privateai-secret-key",
        description="Secret key for session signing",
    )
    enable_rag: bool = Field(
        default=True,
        description="Enable RAG / document upload features",
    )


class OpenWebuiState(BaseModel):
    """Current state of the local Open WebUI instance."""

    status: OpenWebuiStatus = OpenWebuiStatus.STOPPED
    pid: int | None = None
    url: str = ""
    config: OpenWebuiEnvConfig = Field(default_factory=OpenWebuiEnvConfig)
    error: str = ""
    uptime_seconds: float = 0.0
    venv_path: str = ""
    installed: bool = False
    connected_deployment_id: str = Field(
        default="",
        description="ID of the deployment whose Ollama server is currently connected",
    )
    connected_deployment_name: str = Field(
        default="",
        description="Display name of the connected deployment",
    )
