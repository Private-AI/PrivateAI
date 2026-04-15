"""Extended Phase 3: lifecycle and recovery-path tests on D2s_v5."""

from __future__ import annotations

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
def lifecycle_ready_deployment() -> dict[str, object]:
    provider = AzureProvider()
    credentials = get_live_credentials()
    config = build_d2s_config(
        name_prefix="privateai-recovery",
        deploy_open_webui=False,
        models=["gemma3:4b"],
    )

    loop = get_event_loop()
    provision_result = loop.run_until_complete(provider.provision(config, credentials))
    assert provision_result.success, f"Provisioning failed: {provision_result.error}"
    assert provision_result.public_ip

    setup_result = loop.run_until_complete(
        provider.setup_vm(
            config,
            credentials,
            provision_result.public_ip,
            "~/.ssh/id_ed25519",
        )
    )
    assert setup_result.success, f"Initial setup failed: {setup_result.error}"

    yield {
        "provider": provider,
        "credentials": credentials,
        "config": config,
        "public_ip": provision_result.public_ip,
    }

    loop.run_until_complete(provider.destroy(config, credentials))


class TestRecoveryPaths:
    def test_stop_start_three_cycles(self, lifecycle_ready_deployment: dict[str, object]) -> None:
        provider = lifecycle_ready_deployment["provider"]
        credentials = lifecycle_ready_deployment["credentials"]
        config = lifecycle_ready_deployment["config"]
        assert provider and credentials and config

        loop = get_event_loop()

        for _ in range(3):
            loop.run_until_complete(  # type: ignore[arg-type]
                provider.stop_vm(config, credentials)
            )
            stopped = loop.run_until_complete(  # type: ignore[arg-type]
                provider.get_vm_status(config, credentials)
            )
            assert "deallocated" in stopped.power_state.lower()

            ip = loop.run_until_complete(  # type: ignore[arg-type]
                provider.start_vm(config, credentials)
            )
            assert ip
            running = loop.run_until_complete(  # type: ignore[arg-type]
                provider.get_vm_status(config, credentials)
            )
            assert "running" in running.power_state.lower()

    def test_rerun_setup_after_restart(self, lifecycle_ready_deployment: dict[str, object]) -> None:
        provider = lifecycle_ready_deployment["provider"]
        credentials = lifecycle_ready_deployment["credentials"]
        config = lifecycle_ready_deployment["config"]
        ip = lifecycle_ready_deployment["public_ip"]
        assert provider and credentials and config and ip

        loop = get_event_loop()
        result = loop.run_until_complete(
            provider.setup_vm(  # type: ignore[arg-type]
                config,
                credentials,
                ip,
                "~/.ssh/id_ed25519",
            )
        )
        assert result.success, f"Setup rerun failed: {result.error}"

        step_status = {step.step: step.status for step in result.steps}
        assert step_status.get("install_ollama") == "completed"

    def test_validation_after_recovery(self, lifecycle_ready_deployment: dict[str, object]) -> None:
        provider = lifecycle_ready_deployment["provider"]
        credentials = lifecycle_ready_deployment["credentials"]
        config = lifecycle_ready_deployment["config"]
        ip = lifecycle_ready_deployment["public_ip"]
        assert provider and credentials and config and ip

        loop = get_event_loop()
        validation = loop.run_until_complete(
            provider.validate(  # type: ignore[arg-type]
                config,
                credentials,
                ip,
                "~/.ssh/id_ed25519",
                check_gpu=False,
            )
        )

        checks = {c.name: c for c in validation.checks}
        assert checks["SSH connectivity"].passed
        assert checks["System info"].passed
        assert checks["Data disk mount"].passed
        assert checks["Ollama service"].passed
        assert checks["Ollama API (remote)"].passed
