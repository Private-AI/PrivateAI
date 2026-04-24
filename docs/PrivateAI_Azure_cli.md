# PrivateAI ↔ Azure CLI Integration Research & Implementation Plan

> **Session Date:** 2025-04-24  
> **Goal:** Automate the Azure manual setup process (App Registrations, Service Principals, RBAC) to enable a "one-click" deployment experience without requiring cloud expertise from the user.  
> **Constraint:** PrivateAI ships as a compiled binary (Electron + PyInstaller'd Python backend). We cannot expect users to have `az` pre-installed.

---

## Table of Contents

1. [The Core Problem](#1-the-core-problem)
2. [Investigation: Can the Python SDK Do This?](#2-investigation-can-the-python-sdk-do-this)
3. [Investigation: Can We Use `azure-cli` as a Python Library?](#3-investigation-can-we-use-azure-cli-as-a-python-library)
4. [The Winning Strategy: Self-Bootstrapping Standalone Azure CLI](#4-the-winning-strategy-self-bootstrapping-standalone-azure-cli)
5. [Reference Implementation: `AzureCliManager`](#5-reference-implementation-azureclimanager)
6. [FastAPI Integration](#6-fastapi-integration)
7. [Frontend Flow (ProvisionWizard.tsx)](#7-frontend-flow-provisionwizardtsx)
8. [Platform-Specific Notes](#8-platform-specific-notes)
9. [Security & Isolation Considerations](#9-security--isolation-considerations)
10. [Summary of Key Decisions](#10-summary-of-key-decisions)
11. [Key Commands Reference](#11-key-commands-reference)

---

## 1. The Core Problem

PrivateAI provisions AMD SEV-SNP confidential VMs on Azure. The current manual setup requires the user to perform **7 steps** in the Azure Portal:

1. Log in to Azure Portal
2. Navigate to Subscriptions → note the Subscription ID
3. Navigate to Azure Active Directory → note the Tenant ID
4. Register a new App (App Registration)
5. Create a Client Secret for that App
6. Assign the "Contributor" RBAC role to the App on the Subscription
7. Copy `client_id`, `client_secret`, `tenant_id`, `subscription_id` into PrivateAI

**Target:** Reduce this to **only billing/account registration** being manual. Steps 2–6 should be one programmatic call.

---

## 2. Investigation: Can the Python SDK Do This?

**Answer: No.**

The standard Azure Management SDKs (`azure-mgmt-*`) are built on the Azure Resource Manager (ARM) REST API. They can manage **resources** (VMs, networks, disks) but they **cannot** create Entra ID (formerly Azure AD) objects like:

- App Registrations
- Service Principals
- Client Secrets

These objects live in the **Microsoft Graph / Entra ID** namespace, not the ARM namespace. The `azure-mgmt-authorization` SDK can assign RBAC roles, but only if the Service Principal already exists.

**Conclusion:** The SDK can handle Step 6 (RBAC assignment) but not Steps 4–5 (App Registration + Secret generation).

---

## 3. Investigation: Can We Use `azure-cli` as a Python Library?

**Answer: Technically yes, but architecturally wrong and unsupported.**

We investigated importing `azure.cli.core` directly:

```python
from azure.cli.core import get_default_cli
cli = get_default_cli()
exit_code = cli.invoke(['ad', 'sp', 'create-for-rbac', '--name', 'PrivateAI-Provisioner'])
```

### Why This Is Rejected

#### A. It Pollutes Global Python State

The `AzCli.__init__` (source read from GitHub `Azure/azure-cli/dev/src/azure-cli-core/azure/cli/core/__init__.py`) performs aggressive side effects:

- Loads persistent session files: `azureProfile.json`, `az.json`, `az.sess`, `commandIndex.json`, `extensionIndex.json`
- Mutates global loggers: Injects `'azure'` into `knack`'s `cli_logger_names`, overrides color maps
- Configures telemetry: Sets up application telemetry hooks that assume they own the process
- Modifies `sys.path`: Extension loading appends directories dynamically
- Runs version migration handlers: `handle_version_update()` can mutate config on disk

#### B. `invoke()` Returns Exit Codes, Not Objects

The actual `__main__.py` shows:

```python
def cli_main(cli, args):
    return cli.invoke(args)

exit_code = cli_main(az_cli, sys.argv[1:])
sys.exit(exit_code)
```

`invoke()` is designed to return an **exit code** (`0`, `1`, `2`). It is not designed to return Python objects, structured data, or clean exceptions. You would need to monkey-patch `sys.stdout` or pass `out_file=` to capture output reliably — both are internal implementation details.

#### C. Authentication Assumes Process Ownership

The CLI maintains auth state in `~/.azure/` (token cache, profile, MSAL state). When used as a library:

- **Concurrent requests corrupt the token cache**: Microsoft explicitly warns about this. Two `invoke()` calls in your FastAPI app can race on `msal_token_cache.json`.
- **No clean credential passing**: You cannot pass a `DefaultAzureCredential` object into `az` commands. The CLI only understands its own logged-in state.
- **Device code flow blocks the thread**: `az login --use-device-code` prints to stdout and blocks. In a library context, hijacking stdout is extremely brittle.

#### D. Heavy, Conflicting Dependency Tree

`azure-cli` is a monolithic distribution with **200+ pinned dependencies**. Installing it into your FastAPI backend's virtualenv will likely conflict with existing packages (`msal`, `cryptography`, `requests`, `urllib3`, `PyJWT`).

#### E. No API Stability Guarantee

The `invoke()` method comes from `knack` (Microsoft's internal CLI framework), not a public Azure SDK surface. Microsoft guarantees:

- ✅ The **command-line interface** (`az ad sp create-for-rbac ...`) is stable
- ❌ The **Python internal APIs** (`AzCli.invoke()`, `MainCommandsLoader`, etc.) can change without semantic versioning

#### F. Unwanted Side Effects in `__main__.py`

Even calling `invoke()` triggers:
- Telemetry events (phones home to Microsoft by default)
- Auto-upgrade checks (may spawn `az upgrade` subprocess)
- Survey prompts (`prompt_survey_message()` can interrupt with interactive prompts)
- Global exception handlers that format errors for terminal output

### The Canonical Comparison

| Approach | Supported? | Global State | Returns Objects | Dependency Weight |
|----------|-----------|-------------|-----------------|-------------------|
| `subprocess(["az", ...])` | ✅ Official | ❌ None | ✅ JSON | ❌ None (external binary) |
| `azure.cli.core.get_default_cli().invoke()` | ❌ Unsupported | ✅ Heavy | ❌ Exit codes | ✅ 200+ packages |

**Using `azure-cli` as a library is like importing `git` as a Python module instead of using `GitPython` or `subprocess` — technically possible because it's written in Python, but architecturally wrong because it's a *tool*, not an *SDK*.**

---

## 4. The Winning Strategy: Self-Bootstrapping Standalone Azure CLI

Instead of requiring a system install or polluting our Python environment, the app manages its own isolated Azure CLI instance.

### Why Standalone Binaries Over `pip install`?

- `pip install azure-cli` pulls 200+ dependencies, can fail on missing system libraries (`libffi`, `openssl`), and takes 3–5 minutes.
- Microsoft's standalone packages are **self-contained, pre-compiled, and extract-and-run**.

### Platform Download Map

| OS | Package | ~Size | Extract Target |
|---|---|---|---|
| **Linux** | `azure-cli-${VER}-linux-x64.tar.gz` | ~210 MB | `~/.privateai/tools/azure-cli/` |
| **macOS** | `azure-cli-${VER}.pkg` | ~220 MB | Requires `installer` or brew fallback |
| **Windows** | `azure-cli-${VER}-x64.zip` | ~190 MB | `~/.privateai/tools/azure-cli/` |

### Architecture

1. **First Use:** Backend checks if `~/.privateai/tools/azure-cli/bin/az` exists.
2. **Download:** If missing, download the official `.tar.gz` / `.zip` from `azcliprod.blob.core.windows.net`.
3. **Extract:** Unpack to `~/.privateai/tools/azure-cli/`.
4. **Isolate:** Set `AZURE_CONFIG_DIR` to `~/.privateai/azure-config/` so we never touch the user's personal `~/.azure/`.
5. **Execute:** Run commands via `subprocess` with guaranteed binary path.
6. **Cleanup (Optional):** After setup, the user can delete `~/.privateai/tools/azure-cli/` to reclaim disk space.

---

## 5. Reference Implementation: `AzureCliManager`

Drop this into `backend/app/providers/azure/cli_manager.py`.

```python
# backend/app/providers/azure/cli_manager.py
"""
Self-contained Azure CLI manager for PrivateAI.
No system dependency on 'az' being pre-installed.
"""

import os
import platform
import shutil
import subprocess
import tarfile
import json
import logging
import zipfile
from pathlib import Path
from typing import Optional
import urllib.request

logger = logging.getLogger(__name__)


class AzureCliManager:
    """
    Manages a self-contained Azure CLI installation for PrivateAI.

    On first use, downloads the official standalone package for the user's OS,
    extracts it to ~/.privateai/tools/azure-cli/, and uses it via subprocess.
    All Azure CLI state (login tokens, config) is isolated to
    ~/.privateai/azure-config/ to avoid polluting the user's system.
    """

    AZURE_CLI_VERSION = "2.85.0"

    # Isolated directories
    PRIVATEAI_DIR = Path.home() / ".privateai"
    AZURE_DIR = PRIVATEAI_DIR / "tools" / "azure-cli"
    AZURE_CONFIG_DIR = PRIVATEAI_DIR / "azure-config"

    # Microsoft official release URLs
    DOWNLOAD_URLS = {
        "Linux": (
            f"https://azcliprod.blob.core.windows.net/release/{AZURE_CLI_VERSION}/"
            f"azure-cli-{AZURE_CLI_VERSION}-linux-x64.tar.gz"
        ),
        "Darwin": (
            f"https://azcliprod.blob.core.windows.net/release/{AZURE_CLI_VERSION}/"
            f"azure-cli-{AZURE_CLI_VERSION}.pkg"
        ),
        "Windows": (
            f"https://azcliprod.blob.core.windows.net/msi/"
            f"azure-cli-{AZURE_CLI_VERSION}-x64.zip"
        ),
    }

    def __init__(self):
        self._az_path: Optional[Path] = None
        self.system = platform.system()

    @property
    def az_executable(self) -> Path:
        """Resolved path to the private Azure CLI binary."""
        if self._az_path:
            return self._az_path

        if self.system in ("Linux", "Darwin"):
            candidate = self.AZURE_DIR / "bin" / "az"
        else:
            candidate = self.AZURE_DIR / "bin" / "az.cmd"

        if candidate.exists():
            self._az_path = candidate
            return candidate

        raise FileNotFoundError(
            "Azure CLI not found. Call .ensure_installed() first."
        )

    def ensure_installed(self, progress_callback=None) -> Path:
        """
        Idempotent: downloads and extracts Azure CLI if missing.
        Returns path to the az binary.
        """
        try:
            return self.az_executable
        except FileNotFoundError:
            pass

        logger.info("Azure CLI not found in %s, bootstrapping...", self.AZURE_DIR)
        self.AZURE_DIR.mkdir(parents=True, exist_ok=True)
        self.AZURE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        url = self.DOWNLOAD_URLS.get(self.system)
        if not url:
            raise RuntimeError(f"Unsupported platform: {self.system}")

        archive_path = self.PRIVATEAI_DIR / f"azure-cli-download.{self._archive_ext()}"

        logger.info("Downloading Azure CLI from %s", url)
        self._download(url, archive_path, progress_callback)

        logger.info("Extracting to %s", self.AZURE_DIR)
        self._extract(archive_path, self.AZURE_DIR)

        archive_path.unlink(missing_ok=True)

        # Verify
        version = self.run(["--version"], check=False)
        logger.info(
            "Azure CLI ready: %s",
            version.stdout.splitlines()[0] if version.stdout else "unknown",
        )

        return self.az_executable

    def run(
        self,
        args: list[str],
        check: bool = True,
        timeout: Optional[int] = 300,
    ) -> subprocess.CompletedProcess:
        """
        Run an Azure CLI command in isolation.

        AZURE_CONFIG_DIR is forced so we don't pollute the user's system config.
        """
        cmd = [str(self.az_executable)] + args
        env = os.environ.copy()
        env["AZURE_CONFIG_DIR"] = str(self.AZURE_CONFIG_DIR)
        env["AZURE_CORE_DISABLE_PROMPTS"] = "true"

        logger.debug("Running: %s", " ".join(cmd))
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=check,
            timeout=timeout,
            env=env,
        )

    def is_logged_in(self) -> bool:
        """Check if the isolated Azure CLI has active credentials."""
        result = self.run(["account", "show"], check=False)
        if result.returncode != 0:
            return False
        try:
            return json.loads(result.stdout or "{}").get("id") is not None
        except json.JSONDecodeError:
            return False

    def get_account(self) -> dict:
        """Return current subscription info as a dict."""
        result = self.run(["account", "show", "--output", "json"])
        return json.loads(result.stdout)

    def create_service_principal(
        self,
        name: str = "PrivateAI-Provisioner",
        role: str = "Contributor",
    ) -> dict:
        """
        One-shot automation of App Registration + SP + Role Assignment.

        This maps to the manual portal steps 4, 5, and 6.
        Returns the SP credentials JSON containing appId, password, tenant.
        """
        account = self.get_account()
        subscription_id = account["id"]
        scope = f"/subscriptions/{subscription_id}"

        result = self.run(
            [
                "ad",
                "sp",
                "create-for-rbac",
                "--name",
                name,
                "--role",
                role,
                "--scopes",
                scope,
                "--output",
                "json",
            ]
        )
        return json.loads(result.stdout)

    def login_device_code(self) -> dict:
        """
        Initiate device code login flow.
        Returns the device code, verification URL, and message.
        """
        result = self.run(
            ["login", "--use-device-code", "--output", "json"],
            check=False,
            timeout=120,
        )
        # az login --use-device-code prints the code to stderr in a human-readable message,
        # but also returns account info to stdout on success. For the initial prompt,
        # we need to parse stderr for the code. This is a known CLI behavior.
        # A more robust approach is to scrape the message from stderr:
        # "To sign in, use a web browser to open the page https://microsoft.com/devicelogin
        #  and enter the code ABCD1234 to authenticate."
        if result.returncode != 0 and "https://microsoft.com/devicelogin" in result.stderr:
            # Parse the code from stderr
            import re
            match = re.search(r"code\s+([A-Z0-9]+)", result.stderr)
            code = match.group(1) if match else ""
            return {
                "code": code,
                "url": "https://microsoft.com/devicelogin",
                "message": result.stderr.strip(),
            }
        elif result.returncode == 0:
            return {"success": True, "account": json.loads(result.stdout)}
        else:
            raise RuntimeError(f"Device code login failed: {result.stderr}")

    def _download(self, url: str, dest: Path, progress_callback=None):
        """Download with simple progress tracking."""

        def reporthook(block_num, block_size, total_size):
            if total_size > 0 and progress_callback:
                pct = min(100, int(block_num * block_size * 100 / total_size))
                progress_callback(pct)

        urllib.request.urlretrieve(url, dest, reporthook)

    def _extract(self, archive: Path, dest: Path):
        if self.system == "Linux":
            with tarfile.open(archive, "r:gz") as tf:
                tf.extractall(path=dest)
        elif self.system == "Darwin":
            # macOS .pkg requires the `installer` command or a brew fallback.
            # For a .pkg, the simplest robust approach is:
            #   installer -pkg archive -target CurrentUserHomeDirectory
            # This installs to /usr/local/az which is not ideal for isolation.
            # Recommended: use Homebrew fallback instead.
            raise NotImplementedError(
                "macOS .pkg extraction not implemented. Use brew install azure-cli fallback."
            )
        else:
            with zipfile.ZipFile(archive, "r") as zf:
                zf.extractall(path=dest)

    def _archive_ext(self) -> str:
        if self.system == "Linux":
            return "tar.gz"
        elif self.system == "Darwin":
            return "pkg"
        return "zip"

    def uninstall(self):
        """Clean up the private Azure CLI installation."""
        if self.AZURE_DIR.exists():
            shutil.rmtree(self.AZURE_DIR)
        if self.AZURE_CONFIG_DIR.exists():
            shutil.rmtree(self.AZURE_CONFIG_DIR)
        logger.info("Azure CLI removed from %s", self.AZURE_DIR)
```

---

## 6. FastAPI Integration

Add this router to `backend/app/routers/azure_setup.py`.

```python
# backend/app/routers/azure_setup.py
from fastapi import APIRouter, HTTPException
from app.providers.azure.cli_manager import AzureCliManager

router = APIRouter(prefix="/azure", tags=["azure"])

# Singleton manager per process
_cli_manager: AzureCliManager | None = None


def get_cli_manager() -> AzureCliManager:
    global _cli_manager
    if _cli_manager is None:
        _cli_manager = AzureCliManager()
        _cli_manager.ensure_installed()
    return _cli_manager


@router.get("/status")
async def azure_status():
    """
    Check if Azure CLI is installed and the user is logged in.
    Returns subscription info if available.
    """
    mgr = get_cli_manager()
    return {
        "installed": True,
        "logged_in": mgr.is_logged_in(),
        "account": mgr.get_account() if mgr.is_logged_in() else None,
    }


@router.post("/login/device-code")
async def login_device_code():
    """
    Initiates the Azure device code login flow.
    Returns a code and URL for the user to authenticate in their browser.
    """
    mgr = get_cli_manager()
    try:
        result = mgr.login_device_code()
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-connect")
async def auto_connect():
    """
    Triggers the one-shot Service Principal creation.

    Prerequisites:
      - User must have completed device code login first.

    This command executes:
      az ad sp create-for-rbac \\
        --name PrivateAI-Provisioner \\
        --role Contributor \\
        --scopes /subscriptions/{current_sub}

    Returns:
      - client_id     (appId)
      - client_secret (password)
      - tenant        (tenant)
      - subscription  (current subscription ID)
    """
    mgr = get_cli_manager()

    if not mgr.is_logged_in():
        raise HTTPException(
            status_code=401,
            detail="Not logged in. Complete device code flow first via /azure/login/device-code",
        )

    try:
        sp = mgr.create_service_principal()
        account = mgr.get_account()
        return {
            "success": True,
            "client_id": sp["appId"],
            "client_secret": sp["password"],
            "tenant": sp["tenant"],
            "subscription": account["id"],
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Azure CLI error: {e.stderr}",
        )
```

### Wiring into `main.py`

```python
# backend/app/main.py
from app.routers import azure_setup

app.include_router(azure_setup.router)
```

---

## 7. Frontend Flow (ProvisionWizard.tsx)

```typescript
// Pseudocode for the React/Electron frontend flow

async function provisionAzure() {
  // 1. Check backend has Azure CLI ready and user state
  const status = await fetch("/api/azure/status").then(r => r.json());

  if (!status.logged_in) {
    // 2. Trigger device code login
    const deviceCode = await fetch("/api/azure/login/device-code", {
      method: "POST"
    }).then(r => r.json());

    // Show modal with instructions
    showModal({
      title: "Authenticate with Azure",
      body: `Go to ${deviceCode.url} and enter code: ${deviceCode.code}`,
    });

    // 3. Poll until login succeeds
    await pollUntil(async () => {
      const s = await fetch("/api/azure/status").then(r => r.json());
      return s.logged_in;
    }, { interval: 3000, timeout: 120000 });

    closeModal();
  }

  // 4. One-click create SP + Role Assignment
  const result = await fetch("/api/azure/auto-connect", {
    method: "POST"
  }).then(r => r.json());

  // 5. Save credentials to PrivateAI config / secure store
  await saveCredentials({
    clientId: result.client_id,
    clientSecret: result.client_secret,
    tenantId: result.tenant,
    subscriptionId: result.subscription,
  });

  // 6. (Optional) Uninstall Azure CLI to save disk space
  // await fetch("/api/azure/uninstall", { method: "POST" });
}
```

---

## 8. Platform-Specific Notes

### Linux (Primary Target)

- **Package:** `.tar.gz` extracts cleanly.
- **Dependencies:** The standalone tarball includes its own embedded Python and libraries. It should run on any modern glibc-based distro.
- **Size:** ~210 MB download, ~400 MB extracted.

### Windows

- **Package:** `.zip` extracts cleanly to `~/.privateai/tools/azure-cli/`.
- **Executable:** Use `az.cmd` instead of `az`.
- **Paths:** `Path.home()` resolves to `%USERPROFILE%`.

### macOS (Caveat)

Microsoft distributes `.pkg` installers, not simple zips. Two options:

**Option A: Homebrew Fallback**
```python
# In ensure_installed(), before downloading:
if shutil.which("brew"):
    subprocess.run(["brew", "install", "azure-cli"], check=True)
    self._az_path = Path(shutil.which("az"))
    return self._az_path
```

**Option B: `.pkg` Extraction**
```python
# Use macOS installer command (installs to /usr/local/az, not ideal for isolation)
subprocess.run([
    "installer", "-pkg", str(archive_path),
    "-target", "CurrentUserHomeDirectory"
], check=True)
```

For a consumer desktop app, **Option A (Homebrew fallback)** is recommended because most macOS developers have Homebrew, and it avoids the permission headaches of `.pkg` installers.

---

## 9. Security & Isolation Considerations

1. **Config Isolation**
   - `AZURE_CONFIG_DIR` is set to `~/.privateai/azure-config/` so PrivateAI never reads from or writes to the user's personal `~/.azure/` directory. This prevents:
     - Token cache corruption if the user also uses Azure CLI manually
     - Leaking the user's existing Azure subscriptions into PrivateAI

2. **Service Principal Scope**
   - `create-for-rbac` is scoped to the **single subscription** that the user is currently logged into:
     ```
     --scopes /subscriptions/{subscription_id}
     ```
   - This follows the Principle of Least Privilege. The SP cannot access other subscriptions.

3. **Secret Handling**
   - The `client_secret` returned by `create-for-rbac` is displayed **once** by Azure.
   - PrivateAI should store it in the OS keychain (Electron's `safeStorage` or Python `keyring`) and never log it.

4. **Cleanup**
   - After setup, the user can optionally delete `~/.privateai/tools/azure-cli/` (~400 MB). The credentials stored in `~/.privateai/azure-config/` can also be removed if no longer needed for refreshes.

5. **Download Verification**
   - Microsoft does not publish SHA256 checksums in a machine-readable format for standalone tarballs. If you want supply-chain security, pin the URL to a specific version and verify the blob size as a sanity check.

---

## 10. Summary of Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Subprocess over Library** | `azure-cli` is a tool, not an SDK. Using `get_default_cli().invoke()` is unsupported, pollutes global state, and introduces 200+ dependency conflicts. |
| **Standalone Binary over `pip install`** | Standalone packages are self-contained and extract in seconds. `pip install` is slow, fragile, and bloats the app's Python environment. |
| **Isolated `AZURE_CONFIG_DIR`** | Prevents PrivateAI from interfering with the user's personal Azure CLI configuration and avoids token cache corruption. |
| **`az ad sp create-for-rbac`** | A single command collapses the manual portal steps 4 (App Registration), 5 (Client Secret), and 6 (RBAC Assignment) into one atomic operation. |
| **Device Code Flow for Auth** | `az login --use-device-code` allows the user to authenticate in their native browser while the backend polls for completion. No need to embed a browser or handle OAuth callbacks. |

---

## 11. Key Commands Reference

This section documents every Azure CLI command that PrivateAI executes (or could execute) during the automated setup flow. Each entry includes the command, its purpose, key arguments, expected JSON output shape, and which manual portal step it replaces.

All commands assume:
- The isolated Azure CLI binary is at `~/.privateai/tools/azure-cli/bin/az`
- `AZURE_CONFIG_DIR` is set to `~/.privateai/azure-config/`
- `--output json` is appended for machine-readable output

---

### 11.1 `az --version`

**Purpose:** Verify the Azure CLI binary is working and determine its version.

**Usage in PrivateAI:**
Called automatically by `AzureCliManager.ensure_installed()` immediately after extraction to confirm the bootstrap succeeded.

**Example:**
```bash
az --version
```

**Expected Output (text, not JSON):**
```
azure-cli                         2.85.0

core                              2.85.0
telemetry                          1.1.0
...
```

**Notes:**
- Returns `0` on success. Non-zero exit code indicates a corrupted or incomplete extraction.

---

### 11.2 `az login --use-device-code`

**Purpose:** Authenticate the user interactively without requiring a local web browser or OAuth redirect server. The CLI prints a short code and a URL; the user opens the URL in any browser, enters the code, and the CLI blocks until authentication completes.

**Usage in PrivateAI:**
Triggered by the frontend when the user clicks "Connect to Azure". The backend starts this command, parses the device code from `stderr`, and returns it to the frontend to display in a modal. The frontend then polls `/azure/status` until `logged_in` becomes `true`.

**Example:**
```bash
az login --use-device-code --output json
```

**Arguments:**
| Flag | Purpose |
|------|---------|
| `--use-device-code` | Forces the device code flow instead of launching a local browser. Essential for headless backend processes. |
| `--output json` | On success, returns the authenticated account list as JSON. |

**Expected `stderr` (while waiting):**
```
To sign in, use a web browser to open the page https://microsoft.com/devicelogin
and enter the code ABCD1234 to authenticate.
```

**Expected `stdout` (on success):**
```json
[
  {
    "cloudName": "AzureCloud",
    "homeTenantId": "00000000-0000-0000-0000-000000000000",
    "id": "12345678-1234-1234-1234-123456789012",
    "isDefault": true,
    "managedByTenants": [],
    "name": "Pay-As-You-Go",
    "state": "Enabled",
    "tenantId": "00000000-0000-0000-0000-000000000000",
    "user": {
      "name": "user@example.com",
      "type": "user"
    }
  }
]
```

**Notes:**
- **Timeout:** The device code is valid for 15 minutes. The CLI blocks the entire time.
- **Multiple tenants:** If the user belongs to multiple tenants, the JSON array contains one entry per subscription/tenant combination. The `isDefault: true` entry is the one the CLI will use for subsequent commands.
- **Re-authentication:** If the token expires later, the user must re-run this flow. PrivateAI should detect expired tokens via `az account show` failing and prompt for re-login.

---

### 11.3 `az account show`

**Purpose:** Retrieve the currently selected subscription and tenant. This is the "who am I and where am I operating?" check.

**Usage in PrivateAI:**
- **Status Check:** `/azure/status` calls this to determine if the user is logged in (exit code `0` = logged in, non-zero = not logged in).
- **Pre-requisite Check:** `create_service_principal()` calls this to get the `subscription_id` needed to build the `--scopes` argument.

**Example:**
```bash
az account show --output json
```

**Expected Output:**
```json
{
  "environmentName": "AzureCloud",
  "homeTenantId": "00000000-0000-0000-0000-000000000000",
  "id": "12345678-1234-1234-1234-123456789012",
  "isDefault": true,
  "managedByTenants": [],
  "name": "Pay-As-You-Go",
  "state": "Enabled",
  "tenantId": "00000000-0000-0000-0000-000000000000",
  "user": {
    "name": "user@example.com",
    "type": "user"
  }
}
```

**Key Fields:**
| Field | Meaning | PrivateAI Usage |
|-------|---------|-----------------|
| `id` | Subscription ID | Passed to `--scopes` in `create-for-rbac`; saved as `subscription_id` in config |
| `tenantId` | Tenant / Directory ID | Saved as `tenant_id` in config |
| `name` | Subscription display name | Shown in the UI for user confirmation |
| `state` | `Enabled` or `Disabled` | Should be `Enabled`; if `Disabled`, provisioning will fail |

**Notes:**
- Returns exit code `1` if not logged in. Always wrap in `check=False` for status probes.

---

### 11.4 `az account list`

**Purpose:** List all subscriptions the authenticated user has access to, across all tenants.

**Usage in PrivateAI:**
Optional. If the user has multiple subscriptions, the UI may call this to let them pick which one to provision into, rather than blindly using the default.

**Example:**
```bash
az account list --output json
```

**Expected Output:**
Same shape as `az account show` but wrapped in an array. Each object has an `isDefault` boolean.

**Notes:**
- To switch the active subscription later, use `az account set --subscription {id}`.

---

### 11.5 `az ad sp create-for-rbac`

**Purpose:** The **single most important command** in the PrivateAI setup flow. It atomically performs three actions that currently require separate manual portal clicks:
1. Creates an **App Registration** in Entra ID
2. Generates a **Client Secret** (password) for that app
3. Assigns an **RBAC Role** (e.g., `Contributor`) to the app's Service Principal on the specified scope

**Usage in PrivateAI:**
Called by `/azure/auto-connect` after the user has authenticated via device code. The returned `appId`, `password`, and `tenant` are the three secrets PrivateAI needs to provision VMs programmatically.

**Example:**
```bash
az ad sp create-for-rbac \
  --name PrivateAI-Provisioner \
  --role Contributor \
  --scopes /subscriptions/12345678-1234-1234-1234-123456789012 \
  --output json
```

**Arguments:**
| Flag | Required? | Purpose |
|------|-----------|---------|
| `--name` | Yes | Display name of the App Registration and Service Principal. Should be unique in the tenant. Default: `PrivateAI-Provisioner`. |
| `--role` | No (default: `Contributor`) | The RBAC role to assign. `Contributor` is sufficient for VM creation, network, disk, and resource group management. Do **not** use `Owner` unless necessary. |
| `--scopes` | No (default: root of current subscription) | The resource scope for the role assignment. We pin it to `/subscriptions/{id}` so the SP can only act on that specific subscription. |
| `--years` | No | Secret expiry in years. Default is `1`. Azure will invalidate the secret after this period. PrivateAI should warn the user before expiry. |
| `--output json` | Yes | Returns structured JSON instead of human-readable text. |

**Expected Output:**
```json
{
  "appId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "displayName": "PrivateAI-Provisioner",
  "password": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tenant": "00000000-0000-0000-0000-000000000000"
}
```

**Key Fields:**
| Field | Meaning | PrivateAI Usage |
|-------|---------|-----------------|
| `appId` | Client ID / Application ID | Saved as `client_id` in config |
| `password` | Client Secret | Saved as `client_secret` in config (store securely!) |
| `tenant` | Tenant ID | Saved as `tenant_id` in config |
| `displayName` | Human-readable name | For display/logging only |

**Notes:**
- **Idempotency:** Running the same command twice with the same `--name` will create a **new secret** on the existing app. It does not fail. If you want strict idempotency, check if the SP exists first with `az ad sp list --filter "displayName eq 'PrivateAI-Provisioner'"`.
- **Secret visibility:** The `password` is returned **only once** in this output. Azure never shows it again. PrivateAI must persist it immediately (keychain, encrypted store) or it is lost.
- **Propagation delay:** After creation, the SP may take 30–60 seconds to propagate through Entra ID. If PrivateAI immediately tries to use the credentials, it may get `AADSTS700016` (application not found). A small retry-backoff is recommended.
- **Role granularity:** If you only need VM rights (not full Contributor), you could use `--role "Virtual Machine Contributor"` for stricter least-privilege. However, PrivateAI also needs to create resource groups, networks, and disks, so `Contributor` is the practical minimum.

---

### 11.6 `az ad sp list`

**Purpose:** List Service Principals in the tenant. Used for idempotency checks or cleanup.

**Usage in PrivateAI:**
Optional. Before calling `create-for-rbac`, you can query to see if an SP with the same name already exists to avoid creating duplicate secrets.

**Example:**
```bash
az ad sp list --filter "displayName eq 'PrivateAI-Provisioner'" --output json
```

**Expected Output:**
```json
[
  {
    "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "appId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "displayName": "PrivateAI-Provisioner",
    ...
  }
]
```

**Notes:**
- Empty array `[]` means the name is available.
- The `id` here is the **Object ID** of the Service Principal (different from the `appId` / Client ID).

---

### 11.7 `az role assignment list`

**Purpose:** Verify that the RBAC role assignment created by `create-for-rbac` actually exists.

**Usage in PrivateAI:**
Optional diagnostic. If provisioning fails with authorization errors, this command confirms whether the SP has the expected role on the subscription.

**Example:**
```bash
az role assignment list \
  --assignee aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa \
  --scope /subscriptions/12345678-1234-1234-1234-123456789012 \
  --output json
```

**Expected Output:**
```json
[
  {
    "id": "/subscriptions/12345678-.../providers/Microsoft.Authorization/roleAssignments/...",
    "roleDefinitionName": "Contributor",
    "principalId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "principalType": "ServicePrincipal",
    "scope": "/subscriptions/12345678-1234-1234-1234-123456789012"
  }
]
```

---

### 11.8 `az logout`

**Purpose:** Clear the active login session from the isolated Azure CLI config. Does **not** delete the App Registration or Service Principal.

**Usage in PrivateAI:**
Called during "Disconnect Azure" or cleanup flows. Useful if the user wants to switch to a different Azure account.

**Example:**
```bash
az logout
```

**Notes:**
- Only affects the isolated `AZURE_CONFIG_DIR`. The user's system `~/.azure/` is untouched.
- After logout, `az account show` will return exit code `1` until the next `az login`.

---

### 11.9 Command Sequence Cheat Sheet

Here is the exact sequence PrivateAI executes, end-to-end:

| Step | Command | Maps to Portal Step |
|------|---------|---------------------|
| 1 | `az login --use-device-code` | 1 (Log in) |
| 2 | `az account show` | 2 + 3 (Get Subscription & Tenant ID) |
| 3 | `az ad sp create-for-rbac --name PrivateAI-Provisioner --role Contributor --scopes /subscriptions/{id}` | 4 + 5 + 6 (App Registration + Secret + RBAC) |
| 4 | (Store `appId`, `password`, `tenant`, `subscription_id` in secure config) | 7 (Copy credentials into app) |

**Total manual steps eliminated:** 6 out of 7. Only billing/account creation remains manual.

---

## Appendix: Verified `knack` Invoke Signature

From the official `microsoft/knack` repository (the CLI framework Azure uses):

```python
def invoke(self, args, initial_invocation_data=None, out_file=None):
    """Invoke a command."""
```

This confirms the programmatic API is intentionally minimal and not designed for library use.

---

## Appendix: Single Command Equivalence

The manual 7-step process maps to these CLI commands:

| Manual Step | CLI Equivalent |
|-------------|---------------|
| 2. Get Subscription ID | `az account show --query id` |
| 3. Get Tenant ID | `az account show --query tenantId` |
| 4. App Registration | `az ad sp create-for-rbac --name X` (implicitly creates the App) |
| 5. Client Secret | `az ad sp create-for-rbac` (implicitly generates a password) |
| 6. RBAC Assignment | `az ad sp create-for-rbac --role Contributor --scopes ...` (implicitly assigns role) |

**`az ad sp create-for-rbac` is the singular command that automates steps 4, 5, and 6.**

---

*Document generated from session research on 2025-04-24.*
