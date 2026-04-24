"""Manual integration test for Azure CLI setup flow.

Requires a human to authenticate via device code in a browser.
Uses an isolated AZURE_CONFIG_DIR so it never touches ~/.azure/.

Run:
    pytest tests/test_azure_cli_setup.py -v -s -m manual

The -s flag is critical so the printed device-code instructions are visible.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import pytest

# ── Timeouts ────────────────────────────────────────────────────────────
DEVICE_CODE_EMIT_TIMEOUT = 30      # seconds to wait for CLI to print the code
DEVICE_CODE_LOGIN_TIMEOUT = 900    # seconds (15 min) for user to complete auth
AZ_COMMAND_TIMEOUT = 300           # seconds for normal az commands


@pytest.fixture(scope="module")
def isolated_azure_env():
    """Provide an isolated temporary AZURE_CONFIG_DIR for the test module."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="privateai_azure_test_"))
    azure_config_dir = tmp_dir / "azure-config"
    azure_config_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["AZURE_CONFIG_DIR"] = str(azure_config_dir)
    env["AZURE_CORE_DISABLE_PROMPTS"] = "true"
    # Force unbuffered output from the az CLI (it is a Python program)
    env["PYTHONUNBUFFERED"] = "1"

    yield env

    # Module teardown: wipe the isolated config
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _run_az(
    args: list[str],
    env: dict,
    check: bool = True,
    timeout: int = AZ_COMMAND_TIMEOUT,
) -> subprocess.CompletedProcess:
    """Run an az command with the isolated environment."""
    cmd = ["az"] + args
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=check,
        timeout=timeout,
        env=env,
    )


def _parse_device_code(text: str) -> dict | None:
    """Extract URL and code from az login --use-device-code output.

    The CLI emits a line like:
        To sign in, use a web browser to open the page
        https://login.microsoft.com/device (or https://microsoft.com/devicelogin)
        and enter the code ABCD1234 to authenticate.
    Returns None if the code is not present yet.
    """
    code_match = re.search(r"code\s+([A-Z0-9]+)\s+to\s+authenticate", text)
    url_match = re.search(r"(https://\S*(?:devicelogin|/device)\S*)", text)
    if not code_match:
        return None
    return {
        "url": url_match.group(1).rstrip(".") if url_match else "https://microsoft.com/devicelogin",
        "code": code_match.group(1),
    }


def _start_login_and_get_code(env: dict) -> tuple[subprocess.Popen, dict, list[str]]:
    """Start `az login --use-device-code` and return (process, code_info, stderr_buffer).

    Reads stderr in a background thread so the parent never blocks.
    Waits up to DEVICE_CODE_EMIT_TIMEOUT seconds for the code line to appear.
    The returned process is still running — caller must wait() on it.
    """
    proc = subprocess.Popen(
        ["az", "login", "--use-device-code"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered
        env=env,
    )

    stderr_buffer: list[str] = []
    stdout_buffer: list[str] = []
    code_found = threading.Event()

    def _drain(pipe, buffer: list[str]) -> None:
        try:
            for line in iter(pipe.readline, ""):
                buffer.append(line)
                if _parse_device_code("".join(buffer)) is not None:
                    code_found.set()
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    stderr_thread = threading.Thread(
        target=_drain, args=(proc.stderr, stderr_buffer), daemon=True
    )
    stdout_thread = threading.Thread(
        target=_drain, args=(proc.stdout, stdout_buffer), daemon=True
    )
    stderr_thread.start()
    stdout_thread.start()

    # Wait for the device code to appear in either stream
    deadline = time.time() + DEVICE_CODE_EMIT_TIMEOUT
    code_info: dict | None = None
    while time.time() < deadline:
        code_info = _parse_device_code("".join(stderr_buffer) + "".join(stdout_buffer))
        if code_info:
            break
        if proc.poll() is not None:
            # Process exited before emitting a code
            break
        time.sleep(0.3)

    if code_info is None:
        # Kill and diagnose
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        raise RuntimeError(
            "Azure CLI did not emit a device code within "
            f"{DEVICE_CODE_EMIT_TIMEOUT}s.\n"
            f"stderr: {''.join(stderr_buffer)!r}\n"
            f"stdout: {''.join(stdout_buffer)!r}"
        )

    return proc, code_info, stderr_buffer


def _wait_for_login_success(
    proc: subprocess.Popen,
    env: dict,
    timeout: int = DEVICE_CODE_LOGIN_TIMEOUT,
) -> dict:
    """Wait for the az login process to finish, then return the active account.

    While waiting, prints a dot every 5 seconds so the user sees progress.
    """
    start = time.time()
    while True:
        ret = proc.poll()
        if ret is not None:
            break
        if time.time() - start > timeout:
            proc.kill()
            proc.wait(timeout=5)
            raise TimeoutError(
                f"Device-code login did not complete within {timeout} seconds."
            )
        # Progress tick every 5s
        elapsed = int(time.time() - start)
        if elapsed > 0 and elapsed % 5 == 0:
            sys.stdout.write(".")
            sys.stdout.flush()
        time.sleep(1)

    sys.stdout.write("\n")
    sys.stdout.flush()

    if proc.returncode != 0:
        raise RuntimeError(
            f"az login exited with code {proc.returncode}. "
            "The user may have cancelled or the code expired."
        )

    # Login succeeded — fetch the active account
    result = _run_az(
        ["account", "show", "--output", "json"],
        env=env,
        check=True,
        timeout=30,
    )
    return json.loads(result.stdout)


def _delete_sp(app_id: str, env: dict) -> None:
    """Idempotent deletion of a Service Principal / App Registration."""
    result = _run_az(
        ["ad", "sp", "delete", "--id", app_id],
        env=env,
        check=False,
        timeout=60,
    )
    # Exit code 0 = deleted; 3 = not found (already gone)
    if result.returncode not in (0, 3):
        print(f"[WARN] SP deletion returned code {result.returncode}: {result.stderr}")


@pytest.mark.manual
def test_azure_cli_setup(isolated_azure_env: dict) -> None:
    """
    End-to-end manual test of the Azure CLI integration:
      1. Verify azure-cli is installed.
      2. Initiate device-code login and prompt the user.
      3. Wait for login to complete.
      4. Create a Service Principal (Contributor on current subscription).
      5. Validate and display the returned credentials.
      6. Verify the role assignment.
      7. Clean up the SP.
    """
    env = isolated_azure_env
    sp_app_id: str | None = None

    try:
        # ── 1. Verify installation ──────────────────────────────────────
        print("\n[1/5] Verifying Azure CLI installation...")
        version_result = _run_az(["--version"], env=env, check=True, timeout=30)
        assert "azure-cli" in version_result.stdout, "azure-cli not found in version output"
        first_line = version_result.stdout.splitlines()[0]
        print(f"    OK: {first_line}")

        # ── 2. Device-code login ────────────────────────────────────────
        print("\n[2/5] Initiating device-code login...")
        login_proc, code_info, _stderr_buffer = _start_login_and_get_code(env)

        print("\n" + "=" * 60)
        print("  AZURE DEVICE CODE LOGIN REQUIRED")
        print("=" * 60)
        print(f"  1. Open this URL in your browser:\n     {code_info['url']}")
        print(f"  2. Enter the code: {code_info['code']}")
        print("=" * 60)
        print(f"\nWaiting up to {DEVICE_CODE_LOGIN_TIMEOUT // 60} min for you to authenticate", end="")
        sys.stdout.flush()

        account = _wait_for_login_success(login_proc, env)
        print(f"    Logged in as: {account['user']['name']}")
        print(f"    Subscription: {account['name']} ({account['id']})")
        print(f"    Tenant:       {account['tenantId']}")

        # ── 3. Create Service Principal ─────────────────────────────────
        subscription_id = account["id"]
        scope = f"/subscriptions/{subscription_id}"
        sp_name = "PrivateAI-Test-Provisioner"

        print(f"\n[3/5] Creating Service Principal '{sp_name}' with Contributor role...")
        sp_result = _run_az(
            [
                "ad", "sp", "create-for-rbac",
                "--name", sp_name,
                "--role", "Contributor",
                "--scopes", scope,
                "--output", "json",
            ],
            env=env,
            check=True,
            timeout=120,
        )
        sp = json.loads(sp_result.stdout)
        sp_app_id = sp["appId"]

        # ── 4. Validate & display credentials ───────────────────────────
        print("\n[4/5] Validating returned credentials...")
        required_keys = {"appId", "password", "tenant", "displayName"}
        assert required_keys.issubset(sp.keys()), f"Missing keys in SP response: {sp.keys()}"

        assert re.match(
            r"^[0-9a-fA-F-]{36}$", sp["appId"]
        ), f"appId does not look like a UUID: {sp['appId']}"
        assert re.match(
            r"^[0-9a-fA-F-]{36}$", sp["tenant"]
        ), f"tenant does not look like a UUID: {sp['tenant']}"
        assert sp["password"], "password is empty"

        print("\n" + "=" * 60)
        print("  AZURE CREDENTIALS (auto-generated)")
        print("=" * 60)
        print(f"  client_id:     {sp['appId']}")
        print(f"  client_secret: {sp['password']}")
        print(f"  tenant_id:     {sp['tenant']}")
        print(f"  subscription:  {subscription_id}")
        print("=" * 60 + "\n")

        # ── 5. Verify role assignment (with retry for propagation) ──────
        print("[5/5] Verifying role assignment exists (allowing for propagation)...")
        assignments: list = []
        for attempt in range(6):  # up to ~60s
            ra_result = _run_az(
                [
                    "role", "assignment", "list",
                    "--assignee", sp_app_id,
                    "--scope", scope,
                    "--output", "json",
                ],
                env=env,
                check=False,
                timeout=60,
            )
            if ra_result.returncode == 0:
                try:
                    assignments = json.loads(ra_result.stdout)
                except json.JSONDecodeError:
                    assignments = []
                if assignments:
                    break
            if attempt < 5:
                time.sleep(10)

        assert len(assignments) >= 1, "No role assignments found for the new SP after propagation wait"
        assert any(
            a.get("roleDefinitionName") == "Contributor" for a in assignments
        ), "Contributor role not found in assignments"
        print("    OK: Contributor role assignment verified.")

    finally:
        # ── Cleanup ─────────────────────────────────────────────────────
        if sp_app_id:
            print(f"\n[CLEANUP] Deleting Service Principal {sp_app_id}...")
            _delete_sp(sp_app_id, env=env)
            print("    Done.")
        else:
            print("\n[CLEANUP] No SP was created; nothing to delete.")

        print("\nTest complete.")
