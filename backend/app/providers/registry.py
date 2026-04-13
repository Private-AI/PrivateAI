"""Provider registry — maps provider names to implementations.

This is the single place where new providers are registered.  To add
GCP support later, import the GCPProvider class here and add it to
``_PROVIDERS``.
"""

from __future__ import annotations

import os
from typing import Any

from app.models.deployment import CloudProvider as CloudProviderEnum
from app.providers.base import CloudProvider


# Lazy registry — providers are instantiated on first access.
_PROVIDERS: dict[str, CloudProvider] = {}


def is_test_mode() -> bool:
    """Check if the backend is running in test/mock mode."""
    return os.environ.get("PRIVATEAI_TEST_MODE", "").lower() == "true"


def _ensure_registered() -> None:
    """Register all available providers (lazy, once).

    When ``PRIVATEAI_TEST_MODE=true`` is set, all providers are replaced
    with the MockProvider that returns dummy data instantly.
    """
    if _PROVIDERS:
        return

    if is_test_mode():
        from app.providers.mock.provider import MockProvider

        _PROVIDERS[CloudProviderEnum.AZURE] = MockProvider()
        return

    # Azure — always available
    from app.providers.azure.provider import AzureProvider

    _PROVIDERS[CloudProviderEnum.AZURE] = AzureProvider()

    # GCP — placeholder for future implementation
    # from app.providers.gcp.provider import GCPProvider
    # _PROVIDERS[CloudProviderEnum.GCP] = GCPProvider()

    # AWS — placeholder for future implementation
    # from app.providers.aws.provider import AWSProvider
    # _PROVIDERS[CloudProviderEnum.AWS] = AWSProvider()


def get_provider(name: str) -> CloudProvider:
    """Get a provider instance by name.

    Raises ``KeyError`` if the provider is not registered.
    """
    _ensure_registered()
    if name not in _PROVIDERS:
        available = ", ".join(_PROVIDERS.keys())
        raise KeyError(f"Unknown provider '{name}'. Available: {available}")
    return _PROVIDERS[name]


def list_providers() -> list[dict[str, Any]]:
    """Return metadata for all registered providers."""
    _ensure_registered()
    return [
        {
            "id": p.name,
            "display_name": p.display_name,
            "regions": p.list_regions(),
        }
        for p in _PROVIDERS.values()
    ]
