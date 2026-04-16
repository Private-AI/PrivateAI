"""Phase 1: Static analysis — import validation and code quality checks.

Zero cost. Tests code quality without touching any cloud APIs.

Run: pytest tests/test_lint.py -m phase1 -v
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
APP_DIR = PROJECT_ROOT / "app"

# All source modules in the new app/ structure
SOURCE_MODULES = [
    "app",
    "app.models",
    "app.models.credentials",
    "app.models.deployment",
    "app.models.schemas",
    "app.providers",
    "app.providers.base",
    "app.providers.registry",
    "app.providers.azure",
    "app.providers.azure.provider",
    "app.providers.azure.config",
    "app.providers.azure.vm_setup",
    "app.providers.azure.validator",
    "app.services",
    "app.services.deployment_store",
    "app.services.orchestrator",
    "app.services.ws_manager",
    "app.routers",
    "app.routers.deployments",
    "app.routers.providers",
    "app.routers.services",
]

SOURCE_FILES = list(APP_DIR.rglob("*.py"))


def _module_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except ModuleNotFoundError:
        return False


REQUIRED_IMPORT_DEPS = ["fastapi", "azure.identity"]
MISSING_IMPORT_DEPS = [dep for dep in REQUIRED_IMPORT_DEPS if not _module_available(dep)]


@pytest.mark.phase1
class TestEnvironmentPreflight:
    """Ensure runtime deps are installed before import-heavy checks run."""

    def test_required_runtime_dependencies_installed(self) -> None:
        assert not MISSING_IMPORT_DEPS, (
            "Missing runtime dependency(s): "
            f"{', '.join(MISSING_IMPORT_DEPS)}. "
            "Run: pip install -r requirements.txt"
        )


@pytest.mark.phase1
@pytest.mark.skipif(
    bool(MISSING_IMPORT_DEPS),
    reason=(
        "Skipping import checks because runtime dependencies are missing: "
        + ", ".join(MISSING_IMPORT_DEPS)
    ),
)
class TestImports:
    """Verify all modules can be imported without errors."""

    @pytest.mark.parametrize("module_name", SOURCE_MODULES)
    def test_import_module(self, module_name: str) -> None:
        """Each module should import without raising."""
        mod = importlib.import_module(module_name)
        assert mod is not None

    def test_deployment_models_exist(self) -> None:
        from app.models.deployment import (
            CloudProvider,
            DeploymentConfig,
            DeploymentRecord,
            DeploymentStatus,
            SecurityLevel,
            ServiceEndpoints,
            SetupConfig,
            StepProgress,
        )

        assert DeploymentConfig is not None
        assert DeploymentRecord is not None
        assert DeploymentStatus is not None

    def test_credential_models_exist(self) -> None:
        from app.models.credentials import (
            AWSCredentials,
            AzureCredentials,
            GCPCredentials,
        )

        assert AzureCredentials is not None
        assert GCPCredentials is not None
        assert AWSCredentials is not None

    def test_provider_base_exists(self) -> None:
        from app.providers.base import (
            CloudProvider,
            ProvisionResult,
            SetupResult,
            ValidationResult,
            VMStatusResult,
        )

        assert CloudProvider is not None
        assert ProvisionResult is not None

    def test_azure_provider_exists(self) -> None:
        from app.providers.azure.provider import AzureProvider

        provider = AzureProvider()
        assert provider.name == "azure"
        assert provider.display_name == "Microsoft Azure"

    def test_provider_registry(self) -> None:
        from app.providers.registry import get_provider, list_providers

        providers = list_providers()
        assert len(providers) >= 1
        azure = get_provider("azure")
        assert azure.name == "azure"

    def test_orchestrator_exists(self) -> None:
        from app.services.orchestrator import DeploymentOrchestrator

        assert callable(DeploymentOrchestrator)

    def test_deployment_store_exists(self) -> None:
        from app.services.deployment_store import DeploymentStore

        store = DeploymentStore()
        assert len(store.list_all()) == 0

    def test_fastapi_app_exists(self) -> None:
        from main import app

        assert app is not None
        assert app.title == "PrivateAI Backend"


@pytest.mark.phase1
class TestCodeQuality:
    """Code quality checks across all source files."""

    @pytest.mark.parametrize("filepath", SOURCE_FILES, ids=lambda f: f.name)
    def test_no_hardcoded_secrets(self, filepath: Path) -> None:
        """No hardcoded passwords or tokens in source."""
        content = filepath.read_text()
        for pattern in ["password=", "secret=", "token=", "api_key="]:
            for i, line in enumerate(content.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith("#") or stripped.startswith('"""'):
                    continue
                if (
                    pattern in stripped.lower()
                    and "Optional" not in stripped
                    and "help=" not in stripped
                    and "description=" not in stripped
                    and "str" not in stripped
                    and "None" not in stripped
                    and "SecretStr" not in stripped
                    and "Literal" not in stripped
                    and "Field" not in stripped
                    and "unused" not in stripped.lower()
                    and "fake" not in stripped.lower()
                    and "mock" not in stripped.lower()
                    and "get_secret_value" not in stripped
                ):
                    pytest.fail(
                        f"Possible hardcoded secret in {filepath.name}:{i}: {stripped[:80]}"
                    )

    @pytest.mark.parametrize(
        "filepath",
        [f for f in SOURCE_FILES if f.name != "__init__.py"],
        ids=lambda f: f.name,
    )
    def test_has_docstring(self, filepath: Path) -> None:
        """All non-init modules should have a module-level docstring."""
        content = filepath.read_text()
        assert '"""' in content[:500], f"{filepath.name} missing module docstring"

    def test_all_expected_files_exist(self) -> None:
        """Verify expected source files are present."""
        expected = [
            "app/__init__.py",
            "app/models/__init__.py",
            "app/models/credentials.py",
            "app/models/deployment.py",
            "app/models/schemas.py",
            "app/providers/__init__.py",
            "app/providers/base.py",
            "app/providers/registry.py",
            "app/providers/azure/__init__.py",
            "app/providers/azure/provider.py",
            "app/providers/azure/config.py",
            "app/providers/azure/vm_setup.py",
            "app/providers/azure/validator.py",
            "app/services/__init__.py",
            "app/services/deployment_store.py",
            "app/services/orchestrator.py",
            "app/services/ws_manager.py",
            "app/routers/__init__.py",
            "app/routers/deployments.py",
            "app/routers/providers.py",
            "app/routers/services.py",
        ]
        for rel_path in expected:
            full_path = PROJECT_ROOT / rel_path
            assert full_path.exists(), f"Missing: {rel_path}"
