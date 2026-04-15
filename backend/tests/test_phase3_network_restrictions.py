"""Extended Phase 3: Network exposure and source restriction checks."""

from __future__ import annotations

import socket
import urllib.request

import pytest

from app.providers.azure.provider import AzureProvider
from tests.live_test_utils import (
    build_d2s_config,
    get_azure_clients,
    get_event_loop,
    get_live_credentials,
    live_enabled,
)

pytestmark = [
    pytest.mark.phase3,
    pytest.mark.skipif(not live_enabled(), reason="Set AZURE_TEST_LIVE=true for live tests"),
]


def _runner_public_cidr() -> str:
    req = urllib.request.Request("https://api.ipify.org", method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        ip = resp.read().decode("utf-8").strip()
    if not ip:
        raise RuntimeError("Could not determine runner public IP")
    return f"{ip}/32"


@pytest.fixture(scope="module")
def restricted_deployment() -> dict[str, object]:
    cidr = _runner_public_cidr()
    provider = AzureProvider()
    credentials = get_live_credentials()
    config = build_d2s_config(
        name_prefix="privateai-net",
        deploy_open_webui=True,
        open_webui_port=3000,
        allowed_ssh_sources=[cidr],
        allowed_api_sources=[cidr],
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
    assert setup_result.success, f"Setup failed: {setup_result.error}"

    yield {
        "provider": provider,
        "credentials": credentials,
        "config": config,
        "public_ip": provision_result.public_ip,
        "cidr": cidr,
    }

    loop.run_until_complete(provider.destroy(config, credentials))


class TestNetworkRestrictions:
    def test_nsg_uses_restricted_source_prefixes(
        self,
        restricted_deployment: dict[str, object],
    ) -> None:
        credentials = restricted_deployment["credentials"]
        config = restricted_deployment["config"]
        cidr = restricted_deployment["cidr"]
        assert credentials and config and cidr

        _, network_client, _ = get_azure_clients(credentials)  # type: ignore[arg-type]
        nsg_name = f"{config.resource_group}-nsg"  # type: ignore[union-attr]
        nsg = network_client.network_security_groups.get(  # type: ignore[union-attr]
            config.resource_group,
            nsg_name,
        )

        assert nsg.security_rules is not None
        sources_by_port = {
            str(rule.destination_port_range): str(rule.source_address_prefix)
            for rule in nsg.security_rules
            if rule.destination_port_range
        }

        assert sources_by_port.get("22") == cidr
        assert sources_by_port.get("11434") == cidr
        assert sources_by_port.get("3000") == cidr

    def test_core_ports_reachable_from_allowed_source(
        self,
        restricted_deployment: dict[str, object],
    ) -> None:
        ip = restricted_deployment["public_ip"]
        assert ip

        for port in (22, 11434, 3000):
            with socket.create_connection((str(ip), port), timeout=8):
                pass

    def test_ollama_and_webui_http_endpoints_reachable(
        self,
        restricted_deployment: dict[str, object],
    ) -> None:
        ip = restricted_deployment["public_ip"]
        assert ip

        with urllib.request.urlopen(f"http://{ip}:11434/api/tags", timeout=20) as ollama_resp:
            assert ollama_resp.status == 200

        with urllib.request.urlopen(f"http://{ip}:3000", timeout=20) as webui_resp:
            assert 200 <= webui_resp.status < 400
