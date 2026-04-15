"""Helpers for live Azure integration tests."""

from __future__ import annotations

import asyncio
import os
import random
import time
from dataclasses import dataclass

from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.resource import ResourceManagementClient

from app.models.credentials import AzureCredentials
from app.models.deployment import (
    CloudProvider,
    DeploymentConfig,
    SecurityLevel,
    SetupConfig,
)


def live_enabled() -> bool:
    return os.environ.get("AZURE_TEST_LIVE", "").lower() == "true"


def get_event_loop() -> asyncio.AbstractEventLoop:
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def unique_suffix() -> str:
    ts = int(time.time())
    rand = random.randint(1000, 9999)
    return f"{ts}-{rand}"


def get_live_credentials() -> AzureCredentials:
    return AzureCredentials(
        subscription_id=os.environ["AZURE_SUBSCRIPTION_ID"],
        tenant_id=os.environ["AZURE_TENANT_ID"],
        client_id=os.environ["AZURE_CLIENT_ID"],
        client_secret=os.environ["AZURE_CLIENT_SECRET"],
    )


def get_azure_clients(
    credentials: AzureCredentials,
) -> tuple[ResourceManagementClient, NetworkManagementClient, ComputeManagementClient]:
    credential = ClientSecretCredential(
        tenant_id=credentials.tenant_id,
        client_id=credentials.client_id,
        client_secret=credentials.client_secret.get_secret_value(),
    )
    resource_client = ResourceManagementClient(credential, credentials.subscription_id)
    network_client = NetworkManagementClient(credential, credentials.subscription_id)
    compute_client = ComputeManagementClient(credential, credentials.subscription_id)
    return resource_client, network_client, compute_client


@dataclass
class LiveDeployment:
    config: DeploymentConfig
    credentials: AzureCredentials
    public_ip: str


def build_d2s_config(
    *,
    name_prefix: str,
    deploy_open_webui: bool,
    open_webui_port: int = 3000,
    models: list[str] | None = None,
    allowed_ssh_sources: list[str] | None = None,
    allowed_api_sources: list[str] | None = None,
    provider_options: dict[str, str] | None = None,
) -> DeploymentConfig:
    suffix = unique_suffix()
    vm_name = f"{name_prefix}-vm-{suffix}"[:63]
    resource_group = f"{name_prefix}-rg-{suffix}"[:63]

    if models is None:
        models = ["gemma3:4b"]
    if allowed_ssh_sources is None:
        allowed_ssh_sources = ["*"]
    if allowed_api_sources is None:
        allowed_api_sources = ["*"]
    if provider_options is None:
        provider_options = {}

    return DeploymentConfig(
        provider=CloudProvider.AZURE,
        region=os.environ.get("AZURE_LOCATION", "eastus"),
        vm_name=vm_name,
        resource_group=resource_group,
        vm_size="Standard_D2s_v5",
        gpu_enabled=False,
        security_level=SecurityLevel.STANDARD,
        os_disk_size_gb=64,
        data_disk_size_gb=32,
        allowed_ssh_sources=allowed_ssh_sources,
        allowed_api_sources=allowed_api_sources,
        setup=SetupConfig(
            models=models,
            deploy_open_webui=deploy_open_webui,
            open_webui_port=open_webui_port,
        ),
        provider_options=provider_options,
    )
