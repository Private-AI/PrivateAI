"""Extended Phase 3: Network exposure and source restriction checks.

The cheap-VPS pipeline only opens ports 22 (SSH) and 11434 (Ollama).
Open WebUI is *not* installed on the cloud VM — it runs locally with
the backend — so there is no port 3000 rule or endpoint to test here.
"""

from __future__ import annotations

import ipaddress
import socket
import time
import urllib.error
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
    endpoints = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://ipinfo.io/ip",
    ]

    last_error: Exception | None = None
    for url in endpoints:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_ip = resp.read().decode("utf-8").strip()

            if not raw_ip:
                continue

            ipaddress.ip_address(raw_ip)
            return f"{raw_ip}/32"
        except Exception as exc:  # noqa: PERF203
            last_error = exc
            continue

    raise RuntimeError(f"Could not determine runner public IP: {last_error}")


def _wait_for_tcp(ip: str, port: int, retries: int = 20, delay_seconds: int = 5) -> None:
    for attempt in range(1, retries + 1):
        try:
            with socket.create_connection((ip, port), timeout=8):
                return
        except OSError:
            if attempt == retries:
                raise
            time.sleep(delay_seconds)


def _wait_for_http(url: str, retries: int = 20, delay_seconds: int = 5) -> None:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                if 200 <= resp.status < 400:
                    return
                last_error = RuntimeError(f"Unexpected status {resp.status} for {url}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc

        if attempt < retries:
            time.sleep(delay_seconds)

    raise RuntimeError(f"HTTP endpoint did not become reachable: {url} ({last_error})")


@pytest.fixture(scope="module")
def restricted_deployment() -> dict[str, object]:
    cidr = _runner_public_cidr()
    provider = AzureProvider()
    credentials = get_live_credentials()
    config = build_d2s_config(
        name_prefix="privateai-net",
        allowed_ssh_sources=[cidr],
        allowed_api_sources=[cidr],
    )

    loop = get_event_loop()
    should_cleanup = False
    try:
        provision_result = loop.run_until_complete(provider.provision(config, credentials))
        assert provision_result.success, f"Provisioning failed: {provision_result.error}"
        assert provision_result.public_ip
        should_cleanup = True

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
    finally:
        if should_cleanup:
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

        sources_by_port: dict[str, set[str]] = {}
        for rule in nsg.security_rules:
            if not rule.destination_port_range:
                continue
            port = str(rule.destination_port_range)
            sources = sources_by_port.setdefault(port, set())
            if rule.source_address_prefix:
                sources.add(str(rule.source_address_prefix))
            if rule.source_address_prefixes:
                sources.update(str(prefix) for prefix in rule.source_address_prefixes)

        # Both required ports must be restricted to the runner CIDR.
        assert cidr in sources_by_port.get("22", set())
        assert cidr in sources_by_port.get("11434", set())
        # Port 3000 must NOT be opened — Open WebUI is local-only.
        assert "3000" not in sources_by_port

    def test_core_ports_reachable_from_allowed_source(
        self,
        restricted_deployment: dict[str, object],
    ) -> None:
        ip = restricted_deployment["public_ip"]
        assert ip

        for port in (22, 11434):
            _wait_for_tcp(str(ip), port)

    def test_ollama_http_endpoint_reachable(
        self,
        restricted_deployment: dict[str, object],
    ) -> None:
        ip = restricted_deployment["public_ip"]
        assert ip

        _wait_for_http(f"http://{ip}:11434/api/tags")
