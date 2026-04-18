"""Extended Phase 3: Validate setup scripts for Ollama and Open WebUI."""

from __future__ import annotations

import json
import urllib.request

import pytest

from app.providers.azure.provider import AzureProvider
from tests.live_test_utils import (
    build_d2s_config,
    get_event_loop,
    get_live_credentials,
    live_enabled,
)

pytestmark = [
    pytest.mark.phase3,
    pytest.mark.skipif(not live_enabled(), reason="Set AZURE_TEST_LIVE=true for live tests"),
]


@pytest.fixture(scope="module")
def setup_ready_d2s() -> dict[str, object]:
    provider = AzureProvider()
    credentials = get_live_credentials()
    config = build_d2s_config(
        name_prefix="privateai-setup",
        deploy_open_webui=True,
        open_webui_port=3000,
        models=["gemma3:4b"],
    )

    loop = get_event_loop()
    should_cleanup = False
    try:
        provision_result = loop.run_until_complete(provider.provision(config, credentials))
        assert provision_result.success, f"Provisioning failed: {provision_result.error}"
        assert provision_result.public_ip, "No public IP assigned"
        should_cleanup = True

        setup_result = loop.run_until_complete(
            provider.setup_vm(
                config,
                credentials,
                provision_result.public_ip,
                "~/.ssh/id_ed25519",
            )
        )
        assert setup_result.success, f"VM setup failed: {setup_result.error}"

        yield {
            "provider": provider,
            "credentials": credentials,
            "config": config,
            "public_ip": provision_result.public_ip,
            "setup_result": setup_result,
        }
    finally:
        if should_cleanup:
            loop.run_until_complete(provider.destroy(config, credentials))


class TestSetupOllamaAndOpenWebUI:
    def test_setup_steps_complete(self, setup_ready_d2s: dict[str, object]) -> None:
        setup_result = setup_ready_d2s["setup_result"]
        assert setup_result is not None

        step_by_name = {
            step.step: step.status
            for step in setup_result.steps  # type: ignore[union-attr]
        }
        assert step_by_name.get("connect") == "completed"
        assert step_by_name.get("install_ollama") == "completed"
        assert step_by_name.get("install_open_webui") == "completed"

    def test_validator_reports_ollama_paths(self, setup_ready_d2s: dict[str, object]) -> None:
        provider = setup_ready_d2s["provider"]
        credentials = setup_ready_d2s["credentials"]
        config = setup_ready_d2s["config"]
        ip = setup_ready_d2s["public_ip"]
        assert provider and credentials and config and ip

        loop = get_event_loop()
        result = loop.run_until_complete(
            provider.validate(  # type: ignore[arg-type]
                config,
                credentials,
                ip,
                "~/.ssh/id_ed25519",
                check_gpu=False,
            )
        )

        checks = {c.name: c for c in result.checks}
        assert checks["SSH connectivity"].passed
        assert checks["Ollama service"].passed
        assert checks["Ollama API (local)"].passed
        assert checks["Ollama API (remote)"].passed
        assert checks["Ollama bound to 0.0.0.0"].passed
        assert checks["Ollama model dir"].passed
        assert checks["Open WebUI container"].passed

    def test_ollama_tags_endpoint_reachable(self, setup_ready_d2s: dict[str, object]) -> None:
        ip = setup_ready_d2s["public_ip"]
        assert ip

        req = urllib.request.Request(f"http://{ip}:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            assert resp.status == 200
            payload = json.loads(resp.read().decode("utf-8"))
            assert "models" in payload

    def test_open_webui_http_reachable(self, setup_ready_d2s: dict[str, object]) -> None:
        ip = setup_ready_d2s["public_ip"]
        assert ip

        req = urllib.request.Request(f"http://{ip}:3000", method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:
            assert 200 <= resp.status < 400
