"""Azure CLI device-code authentication & Service Principal provisioning.

Endpoints the frontend calls during the "Connect to Azure" wizard:

    1. POST /api/v1/azure/cli/login/start
         -> returns { session_id, verification_url, user_code }
         Frontend shows a modal telling the user to open the URL and enter
         the code.

    2. GET  /api/v1/azure/cli/login/status?session_id=...
         Frontend polls this every ~3s.  When status becomes
         "authenticated" the account info (subscription / tenant) is
         included in the response.

    3. POST /api/v1/azure/cli/provision
         Once the user is authenticated, this creates the App
         Registration + Client Secret + Contributor role assignment in a
         single call and returns the credentials PrivateAI will use to
         provision VMs.

    4. POST /api/v1/azure/cli/login/cancel
         Abort an in-flight login (e.g. user closed the modal).

All sessions are isolated — each gets its own AZURE_CONFIG_DIR under
/tmp/privateai-azure-sessions/ so we never touch ~/.azure/.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import anyio
from fastapi import APIRouter, HTTPException, Query

from app.models.credentials import AzureCredentials
from app.models.schemas import (
    AzureCliCancelResponse,
    AzureCliLoginStartResponse,
    AzureCliLoginStatusResponse,
    AzureCliProvisionRequest,
    AzureCliProvisionResponse,
    ErrorResponse,
)
from app.services.azure_cli_auth import (
    AuthStatus,
    get_cli_auth_manager,
    is_az_available,
)
from app.services.deployment_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/azure/cli", tags=["azure-cli-auth"])

# Small pool for the few blocking az calls we still need to make
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="azure-cli")


def _require_az() -> None:
    if not is_az_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "The 'az' binary is not available in the backend container. "
                "Rebuild the Docker image with the azure-cli apt install step."
            ),
        )


@router.post(
    "/login/start",
    response_model=AzureCliLoginStartResponse,
    responses={503: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def start_device_code_login() -> AzureCliLoginStartResponse:
    """Kick off ``az login --use-device-code`` and return the user code.

    The subprocess runs in the background under a fresh session id.  The
    frontend should display the returned ``verification_url`` and
    ``user_code`` and then poll ``/login/status`` until authenticated.
    """
    _require_az()
    manager = get_cli_auth_manager()
    session = manager.create_session()

    try:
        # start_login spawns the subprocess and blocks for up to ~30s
        # waiting for the device code to appear on stderr.  Run it in a
        # worker thread so we don't stall the event loop.
        device_code = await anyio.to_thread.run_sync(session.start_login)
    except Exception as e:
        manager.drop_session(session.id)
        logger.exception("Could not start Azure device-code login")
        raise HTTPException(status_code=500, detail=str(e)) from e

    return AzureCliLoginStartResponse(
        session_id=session.id,
        verification_url=device_code.url,
        user_code=device_code.code,
        message=device_code.message,
    )


@router.get(
    "/login/status",
    response_model=AzureCliLoginStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_login_status(
    session_id: str = Query(..., description="Session id returned by /login/start"),
) -> AzureCliLoginStatusResponse:
    """Non-blocking poll of a device-code login flow.

    Returns one of:
      - ``pending``       — still waiting for the user
      - ``authenticated`` — user completed login, SP not yet created
      - ``provisioned``   — SP has been created on this session
      - ``failed``        — login failed or was cancelled
      - ``expired``       — session was garbage-collected
    """
    _require_az()
    manager = get_cli_auth_manager()
    try:
        session = manager.get_session(session_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    status = await anyio.to_thread.run_sync(session.poll_status)
    account = session.account

    return AzureCliLoginStatusResponse(
        session_id=session.id,
        status=status,
        subscription_id=account.subscription_id if account else "",
        subscription_name=account.subscription_name if account else "",
        tenant_id=account.tenant_id if account else "",
        user_name=account.user_name if account else "",
        error=session.error,
    )


@router.post(
    "/provision",
    response_model=AzureCliProvisionResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def provision_service_principal(
    request: AzureCliProvisionRequest,
) -> AzureCliProvisionResponse:
    """Create an App Registration + Service Principal + Contributor role.

    Must be called after ``/login/status`` reports ``authenticated``.  The
    returned credentials are also stashed on the deployment store as the
    active provider credentials so subsequent provisioning calls work
    without the frontend having to re-send them.
    """
    _require_az()
    manager = get_cli_auth_manager()
    try:
        session = manager.get_session(request.session_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    if session.status != AuthStatus.AUTHENTICATED:
        # Refresh status in case the caller skipped polling
        await anyio.to_thread.run_sync(session.poll_status)

    if session.status not in (AuthStatus.AUTHENTICATED, AuthStatus.PROVISIONED):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Session status is '{session.status}'. "
                "Complete device-code login before calling /provision."
            ),
        )

    if session.sp_credentials is not None:
        # Idempotent: already provisioned — return the existing creds.
        creds = session.sp_credentials
    else:
        try:
            creds = await anyio.to_thread.run_sync(
                session.create_service_principal,
                request.name,
                request.role,
            )
        except Exception as e:
            logger.exception("Service principal creation failed")
            raise HTTPException(status_code=500, detail=str(e)) from e

    # Persist the new credentials as the active Azure creds so the rest
    # of the PrivateAI provisioning flow can use them immediately.
    try:
        azure_creds = AzureCredentials(
            subscription_id=creds.subscription_id,
            tenant_id=creds.tenant_id,
            client_id=creds.client_id,
            client_secret=creds.client_secret,  # type: ignore[arg-type]
        )
        get_store().set_provider_credentials("azure", azure_creds)
    except Exception as e:  # non-fatal — frontend still gets the creds
        logger.warning("Could not persist Azure credentials to store: %s", e)

    return AzureCliProvisionResponse(
        session_id=session.id,
        status=AuthStatus.PROVISIONED,
        client_id=creds.client_id,
        client_secret=creds.client_secret,
        tenant_id=creds.tenant_id,
        subscription_id=creds.subscription_id,
        display_name=creds.display_name,
    )


@router.post(
    "/login/cancel",
    response_model=AzureCliCancelResponse,
    responses={404: {"model": ErrorResponse}},
)
async def cancel_login(
    session_id: str = Query(..., description="Session id returned by /login/start"),
) -> AzureCliCancelResponse:
    """Abort an in-flight device-code login and clean up its resources."""
    manager = get_cli_auth_manager()
    try:
        manager.get_session(session_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    manager.drop_session(session_id)
    return AzureCliCancelResponse(
        session_id=session_id,
        cancelled=True,
        message="Session cancelled and resources cleaned up.",
    )
