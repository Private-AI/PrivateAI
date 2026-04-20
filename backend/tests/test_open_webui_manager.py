"""Open WebUI reconnect behaviour tests.

These tests stay local-only: no real Open WebUI process is launched and no
real SSH connection is made.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.models.deployment import DeploymentRecord, DeploymentStatus
from app.models.open_webui import OpenWebuiEnvConfig, OpenWebuiState, OpenWebuiStatus
from app.services.open_webui_manager import OpenWebuiManager
from main import _start_open_webui


@pytest.mark.phase2
class TestOpenWebuiReconnect:
    def test_connect_to_deployment_restarts_running_open_webui(
        self,
        monkeypatch: pytest.MonkeyPatch,
        test_config,
    ) -> None:
        manager = OpenWebuiManager()
        manager._status = OpenWebuiStatus.RUNNING

        restarted = {"count": 0}

        async def fake_restart(config=None):  # type: ignore[no-untyped-def]
            restarted["count"] += 1
            return manager.get_state()

        class FakeTunnelManager:
            def start_tunnel(self, **kwargs):  # type: ignore[no-untyped-def]
                return "http://127.0.0.1:39001"

        monkeypatch.setattr(
            "app.services.ssh_tunnel.get_tunnel_manager",
            lambda: FakeTunnelManager(),
        )
        monkeypatch.setattr(manager, "restart", fake_restart)

        state = asyncio.run(
            manager.connect_to_deployment(
                deployment_id="dep-123",
                deployment_name=test_config.vm_name,
                ollama_url="http://203.0.113.10:11434",
                ssh_key_path="~/.ssh/id_ed25519",
                vm_user="azureuser",
            )
        )

        assert restarted["count"] == 1
        assert manager.get_config().ollama_base_urls == "http://127.0.0.1:39001"
        assert state.config.ollama_base_urls == "http://127.0.0.1:39001"
        assert state.connected_deployment_id == "dep-123"
        assert state.connected_deployment_name == test_config.vm_name

    def test_connect_to_deployment_raises_if_tunnel_fails(
        self,
        monkeypatch: pytest.MonkeyPatch,
        test_config,
    ) -> None:
        manager = OpenWebuiManager()

        class FakeTunnelManager:
            def start_tunnel(self, **kwargs):  # type: ignore[no-untyped-def]
                raise OSError("permission denied")

        monkeypatch.setattr(
            "app.services.ssh_tunnel.get_tunnel_manager",
            lambda: FakeTunnelManager(),
        )

        with pytest.raises(RuntimeError, match="SSH tunnel setup failed: permission denied"):
            asyncio.run(
                manager.connect_to_deployment(
                    deployment_id="dep-123",
                    deployment_name=test_config.vm_name,
                    ollama_url="http://203.0.113.10:11434",
                    ssh_key_path="~/.ssh/id_ed25519",
                    vm_user="azureuser",
                )
            )

    def test_startup_reconnect_uses_connect_flow(
        self,
        monkeypatch: pytest.MonkeyPatch,
        test_config,
    ) -> None:
        older = DeploymentRecord(
            config=test_config,
            status=DeploymentStatus.RUNNING,
            public_ip="203.0.113.11",
        )
        older.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)

        latest_config = test_config.model_copy(deep=True)
        latest_config.vm_name = "latest-vm"
        latest = DeploymentRecord(
            config=latest_config,
            status=DeploymentStatus.RUNNING,
            public_ip="203.0.113.12",
        )
        latest.updated_at = datetime.now(timezone.utc)

        class FakeStore:
            def list_all(self) -> list[DeploymentRecord]:
                return [older, latest]

        calls: dict[str, str] = {}

        class FakeManager:
            async def start(self) -> OpenWebuiState:
                return OpenWebuiState(
                    status=OpenWebuiStatus.RUNNING,
                    url="http://localhost:8080",
                )

            async def connect_to_deployment(
                self,
                deployment_id: str,
                deployment_name: str,
                ollama_url: str,
                ssh_key_path: str = "~/.ssh/id_ed25519",
                vm_user: str = "azureuser",
            ) -> OpenWebuiState:
                calls["deployment_id"] = deployment_id
                calls["deployment_name"] = deployment_name
                calls["ollama_url"] = ollama_url
                calls["ssh_key_path"] = ssh_key_path
                calls["vm_user"] = vm_user
                return OpenWebuiState(
                    status=OpenWebuiStatus.RUNNING,
                    url="http://localhost:8080",
                    config=OpenWebuiEnvConfig(
                        ollama_base_urls="http://127.0.0.1:39001",
                    ),
                )

        monkeypatch.setattr(
            "app.services.deployment_store.get_store",
            lambda: FakeStore(),
        )

        asyncio.run(_start_open_webui(FakeManager()))

        assert calls == {
            "deployment_id": latest.id,
            "deployment_name": latest.config.vm_name,
            "ollama_url": "http://203.0.113.12:11434",
            "ssh_key_path": "~/.ssh/id_ed25519",
            "vm_user": "azureuser",
        }
