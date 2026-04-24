# Azure CLI — Frontend Integration Guide

> **Audience:** Frontend engineers adding the "Connect to Azure" / "one-click onboarding" flow to the provisioning wizard.
> **Backend status:** Endpoints are implemented, tested, and live at `/api/v1/azure/cli/*`. No backend changes are required.
> **Scope:** This document describes **what to build on the frontend**. It does not ship any frontend code.

---

## 1. Why this exists

The current wizard has four steps:

```
Step 0  Provider
Step 1  Credentials   ← user manually creates an Azure SP and types 4 UUIDs here
Step 2  Configuration
Step 3  Deploy
```

Step 1 is the single biggest friction point. The user has to:

1. Log in to the Azure portal.
2. Find the subscription ID.
3. Find the tenant ID.
4. Create an App Registration.
5. Create a Client Secret.
6. Assign the Contributor RBAC role.
7. Copy four values back into PrivateAI.

The new backend endpoints collapse steps 2–6 into a single button click. The
only thing the user still does manually is authenticate in a browser — the
same gesture as logging into any other web app.

---

## 2. Proposed UX

Keep the existing "Credentials" step, but add a **primary action at the top**
that drives the new flow. The manual form remains available as a fallback
("I already have a Service Principal") so power users and the testing
pipeline aren't forced through the browser flow.

```
┌─────────────────────────────────────────────────────────────┐
│   Azure Credentials                                         │
│                                                             │
│   ┌───────────────────────────────────────────────────────┐ │
│   │   🟦  Connect to Azure                                │ │
│   │      We'll open a Microsoft login page and set up     │ │
│   │      the service principal for you automatically.     │ │
│   └───────────────────────────────────────────────────────┘ │
│                                                             │
│   or enter credentials manually  ▼                          │
│     [ existing form: subscription_id, tenant_id, ... ]      │
│                                                             │
│   [ Back ]                                        [ Next ]  │
└─────────────────────────────────────────────────────────────┘
```

When the user clicks **Connect to Azure**, show a modal dialog with:

```
┌─────────────────────────────────────────────────────────────┐
│   Sign in to Azure                                          │
│                                                             │
│   1.  Open this page in your browser:                       │
│         https://login.microsoft.com/device   [Copy] [Open]  │
│                                                             │
│   2.  Enter this code:                                      │
│         ┌─────────────┐                                     │
│         │  ABCD1234   │  [Copy]                             │
│         └─────────────┘                                     │
│                                                             │
│   Waiting for you to authenticate...  ⏳                     │
│                                                             │
│                                            [Cancel]         │
└─────────────────────────────────────────────────────────────┘
```

Once the backend reports `authenticated`, transition to a short
"Creating service principal..." state, then close the modal and drop the
four credential values into the existing form fields (read-only, with a
success badge). The user clicks **Next** to continue.

---

## 3. Endpoint contract

All four endpoints live under `/api/v1/azure/cli/`. See
[`API_Spec.md`](API_Spec.md#azure-cli-device-code-auth) for the full spec.
A minimal summary:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/login/start` | Spawns `az login` in the backend; returns `{ session_id, verification_url, user_code, message }`. |
| `GET`  | `/login/status?session_id=…` | Returns `{ status, subscription_id, tenant_id, user_name, … }`. Non-blocking. |
| `POST` | `/provision` | Body: `{ session_id, name?, role? }`. Returns `{ client_id, client_secret, tenant_id, subscription_id, display_name }`. |
| `POST` | `/login/cancel?session_id=…` | Aborts the flow and frees server resources. |

### Status values

| `status`         | What to do in the UI                                              |
|------------------|-------------------------------------------------------------------|
| `pending`        | Keep the modal open, keep polling.                                |
| `authenticated`  | Stop polling. Call `/provision`. Show "Creating service principal...". |
| `provisioned`    | (Idempotent — `/provision` already ran for this session.)         |
| `failed`         | Show `status.error` in the modal. Offer retry.                    |
| `expired`        | The session was GC'd (user idled > 30 min). Restart the flow.     |

### Error codes

| HTTP | Endpoint              | Typical cause                                              | Recovery                                |
|------|-----------------------|------------------------------------------------------------|-----------------------------------------|
| 503  | `/login/start`        | `az` not installed in the container (image not rebuilt).   | Show "backend not configured" message.  |
| 500  | `/login/start`        | CLI didn't emit a code within 30 s.                        | Offer retry.                            |
| 404  | `/login/status`, etc. | `session_id` unknown, cancelled, or expired.               | Restart the flow.                       |
| 400  | `/provision`          | Called before `status == authenticated`.                   | Resume polling `/login/status`.         |

---

## 4. Recommended client-side state machine

```
                  ┌───── click "Connect to Azure"
                  ▼
           ╭──────────────╮
           │  STARTING    │   POST /login/start
           ╰──────┬───────╯
                  │   (response)                   (500 / 503)
                  ├──────────────► ERROR_START ◄─────────────
                  ▼
           ╭──────────────╮
           │   POLLING    │   GET /login/status every 2–3 s
           ╰──────┬───────╯
                  │
        status =  │ authenticated
                  ▼
           ╭──────────────╮
           │ PROVISIONING │   POST /provision
           ╰──────┬───────╯
                  │
                  ▼
           ╭──────────────╮
           │   SUCCESS    │   Populate credentials form
           ╰──────────────╯   Close modal

 From POLLING:
   status = failed / expired  → ERROR_AUTH (show reason, retry button)
   user clicks Cancel         → POST /login/cancel → IDLE
```

Implementing this as a `useReducer` or a tiny XState machine is cleanest.
A flat `useState` is also fine for a first pass — the number of transitions
is small.

---

## 5. Implementation sketch

**This is illustrative, not prescriptive.**  Adapt to the project's existing
patterns (the API client in `frontend/app/lib/api.ts`, the wizard's
`useState` conventions, the design tokens in `globals.css`, etc.).

### 5.1  Add API client functions

In `frontend/app/lib/api.ts`, add the four wrappers alongside the existing
`validateCredentials` / `createDeployment` helpers:

```typescript
// Azure CLI device-code auth -------------------------------------------
export interface AzureCliLoginStart {
  session_id: string;
  verification_url: string;
  user_code: string;
  message: string;
}

export interface AzureCliLoginStatus {
  session_id: string;
  status: "pending" | "authenticated" | "provisioned" | "failed" | "expired";
  subscription_id: string;
  subscription_name: string;
  tenant_id: string;
  user_name: string;
  error: string;
}

export interface AzureCliProvisionResult {
  session_id: string;
  status: "provisioned";
  client_id: string;
  client_secret: string;
  tenant_id: string;
  subscription_id: string;
  display_name: string;
}

export function startAzureCliLogin(): Promise<AzureCliLoginStart> {
  return request("/azure/cli/login/start", { method: "POST" });
}

export function fetchAzureCliLoginStatus(
  sessionId: string,
): Promise<AzureCliLoginStatus> {
  return request(
    `/azure/cli/login/status?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export function provisionAzureCliServicePrincipal(
  sessionId: string,
  opts: { name?: string; role?: string } = {},
): Promise<AzureCliProvisionResult> {
  return request("/azure/cli/provision", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, ...opts }),
  });
}

export function cancelAzureCliLogin(
  sessionId: string,
): Promise<{ cancelled: boolean; message: string }> {
  return request(
    `/azure/cli/login/cancel?session_id=${encodeURIComponent(sessionId)}`,
    { method: "POST" },
  );
}
```

### 5.2  Modal component

Create `frontend/app/provision/AzureLoginModal.tsx` (or wherever modals live
in the current codebase). It owns the state machine and the polling loop.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  startAzureCliLogin,
  fetchAzureCliLoginStatus,
  provisionAzureCliServicePrincipal,
  cancelAzureCliLogin,
  type AzureCliProvisionResult,
} from "@/app/lib/api";

type Phase =
  | { kind: "starting" }
  | { kind: "polling"; sessionId: string; url: string; code: string }
  | { kind: "provisioning"; sessionId: string }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 15 * 60 * 1000; // 15 min — matches Azure device-code validity

export function AzureLoginModal({
  open,
  onSuccess,
  onClose,
}: {
  open: boolean;
  onSuccess: (creds: AzureCliProvisionResult) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const sessionIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);

  // Kick off the flow whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "starting" });
    let cancelled = false;

    (async () => {
      try {
        const start = await startAzureCliLogin();
        if (cancelled) return;
        sessionIdRef.current = start.session_id;
        startedAtRef.current = Date.now();
        setPhase({
          kind: "polling",
          sessionId: start.session_id,
          url: start.verification_url,
          code: start.user_code,
        });
        poll();
      } catch (e) {
        if (!cancelled) setPhase({ kind: "error", message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      // Best-effort cancel on unmount
      const sid = sessionIdRef.current;
      if (sid) cancelAzureCliLogin(sid).catch(() => {});
      sessionIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function poll() {
    const sid = sessionIdRef.current;
    if (!sid) return;

    if (Date.now() - startedAtRef.current > MAX_POLL_MS) {
      setPhase({ kind: "error", message: "Login timed out. Please try again." });
      return;
    }

    try {
      const status = await fetchAzureCliLoginStatus(sid);
      switch (status.status) {
        case "pending":
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        case "authenticated":
        case "provisioned": {
          setPhase({ kind: "provisioning", sessionId: sid });
          const creds = await provisionAzureCliServicePrincipal(sid);
          onSuccess(creds);
          onClose();
          return;
        }
        case "failed":
          setPhase({
            kind: "error",
            message: status.error || "Azure login failed.",
          });
          return;
        case "expired":
          setPhase({
            kind: "error",
            message: "Session expired — please retry.",
          });
          return;
      }
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  }

  async function handleCancel() {
    stopPolling();
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await cancelAzureCliLogin(sid);
      } catch {
        /* best effort */
      }
    }
    sessionIdRef.current = null;
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      {phase.kind === "starting" && <p>Starting Azure login…</p>}

      {phase.kind === "polling" && (
        <>
          <h2>Sign in to Azure</h2>
          <p>
            1. Open{" "}
            <a href={phase.url} target="_blank" rel="noopener noreferrer">
              {phase.url}
            </a>
          </p>
          <p>
            2. Enter this code: <code>{phase.code}</code>
          </p>
          <p>Waiting for authentication…</p>
          <button onClick={handleCancel}>Cancel</button>
        </>
      )}

      {phase.kind === "provisioning" && (
        <p>Authenticated. Creating service principal…</p>
      )}

      {phase.kind === "error" && (
        <>
          <p>{phase.message}</p>
          <button onClick={onClose}>Close</button>
        </>
      )}
    </div>
  );
}
```

### 5.3  Wire into `ProvisionWizard.tsx`

The `CredentialsStep` currently has a `form` object driving the four input
fields. When the modal succeeds, write the returned values into that same
state and mark validation as successful. Also trigger the existing
`validateCredentials` flow so the downstream steps treat these credentials
as already validated:

```tsx
const [azureLoginOpen, setAzureLoginOpen] = useState(false);

// In CredentialsStep JSX, above the form fields:
<button
  type="button"
  className="btn btn-primary"
  onClick={() => setAzureLoginOpen(true)}
>
  Connect to Azure
</button>
<p className="text-xs text-[var(--muted)]">
  We’ll open a Microsoft login page and set up the service principal
  automatically.
</p>

{/* ... manual form remains below ... */}

<AzureLoginModal
  open={azureLoginOpen}
  onClose={() => setAzureLoginOpen(false)}
  onSuccess={(creds) => {
    onChange({
      subscription_id: creds.subscription_id,
      tenant_id: creds.tenant_id,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    });
    // Call the existing validator so the "Valid" badge lights up and
    // `canProceed` flips to true. The backend already cached the
    // credentials when /provision ran, so this is effectively a no-op
    // on the server but keeps the wizard's UI invariant correct.
    onValidate();
  }}
/>
```

After a successful return, show a small confirmation badge next to the
form (e.g. a green "Service principal `PrivateAI-Provisioner` created")
and ideally disable the manual form fields to signal that the auto-
generated credentials should not be edited.

---

## 6. UX details that matter

- **Large, monospace device code.** Users copy it by eye. Make it at least `text-2xl`, `font-mono`, with clear tracking.
- **Copy buttons.** Both the URL and the code should have one-click copy. On desktop this is table stakes; on Electron even more so.
- **"Open in browser" button.** In Electron, call `shell.openExternal(url)` so the user doesn't have to alt-tab. In the web build use `window.open(url, "_blank")`.
- **Loading state while starting.** `/login/start` returns in ~1 s but can stall up to 30 s on a cold image. Show a spinner — don't leave the user looking at an empty modal.
- **Countdown.** Azure device codes expire after 15 minutes. A "code expires in 14:32" counter reassures the user that the flow isn't frozen and pre-empts "did I take too long?" anxiety.
- **Error messages.** Surface `status.error` verbatim when `status === "failed"`. These come straight from `az` and are usually actionable (e.g. "AADSTS50020: user account does not exist in tenant").
- **Retry.** On any terminal error, offer a retry button that calls `/login/cancel` (cleanup) then re-opens the modal.

---

## 7. Edge cases & gotchas

1. **User closes the modal without clicking Cancel.**
   The cleanup effect in the `useEffect` returned function calls `/login/cancel` best-effort. If the request fails, the session is garbage-collected server-side after 30 min of inactivity.

2. **User refreshes the page mid-flow.**
   The session id is held only in component state. A refresh loses it and orphans the server-side session (which will be GC'd). This is the correct behaviour — the user can simply re-open the modal.

3. **Backend container rebuilt without `az`.**
   `/login/start` returns `503`. The modal should show "Azure CLI is not available in the backend. Please rebuild the Docker image." rather than a generic error.

4. **User switches to the manual form after clicking "Connect to Azure".**
   If they're mid-polling, call `/login/cancel` when the modal closes, then proceed with manual entry. Do not silently leak the session.

5. **Subscription selection.**
   `/provision` targets whatever subscription is returned by `az account show` — which is whichever one Azure defaults to after login. If the user has multiple subscriptions and picked the wrong one, they'll need to either:
   - Use the Azure portal to set their default subscription before clicking "Connect to Azure", or
   - Use the manual credentials form with the desired subscription id.

   A future iteration could add `/login/status` → list of subscriptions → "pick one" → `az account set --subscription ID` → `/provision`. Deliberately out of scope for v1.

6. **Concurrent logins from multiple tabs.**
   Each call to `/login/start` creates a distinct session id. Two tabs will not clobber each other server-side. However, only the credentials from whichever tab's `/provision` ran **last** will be cached as the active Azure provider credentials. This is almost certainly the desired behaviour.

7. **The returned `client_secret` is shown once.**
   Azure will not return it again. The frontend must persist it into the credentials form state immediately. Do **not** try to fetch it later via `/login/status` — it is intentionally not exposed there.

8. **`role` and `name` customisation.**
   `/provision` accepts both. For v1 the modal doesn't need UI for them — the defaults (`PrivateAI-Provisioner` / `Contributor`) are correct. Advanced-mode users can pass overrides via the manual form if they really want to.

---

## 8. Testing

### Manual flow
Run the existing backend pytest marker to sanity-check end-to-end:
```bash
docker exec -it privateai-combined bash -c \
  "cd /app/backend && pytest tests/test_azure_cli_setup.py -v -s -m manual"
```
This performs the same four HTTP calls your frontend will make, from a
Python script, and walks through login → provision → role verification →
cleanup. If the backend leg works here, it will work from the UI.

### Happy-path smoke test (no real login)
The first two endpoints don't need a real Azure account to return a
realistic response:
```bash
curl -s -X POST http://localhost:8000/api/v1/azure/cli/login/start \
  | jq '.verification_url, .user_code'
# → "https://login.microsoft.com/device"
# → "ABCD1234"
```
Use this to build out the UI states in Storybook / ad-hoc before doing a
live run.

### Cancellation
```bash
SID=$(curl -s -X POST http://localhost:8000/api/v1/azure/cli/login/start \
  | jq -r .session_id)
curl -s -X POST "http://localhost:8000/api/v1/azure/cli/login/cancel?session_id=$SID"
# → { "cancelled": true, ... }
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8000/api/v1/azure/cli/login/status?session_id=$SID"
# → 404
```

---

## 9. Recap — what changes on the frontend

| Area | Change |
|------|--------|
| `app/lib/api.ts` | Add 4 wrapper functions for `/api/v1/azure/cli/*`. |
| `app/provision/` | Add an `AzureLoginModal` component owning the state machine + polling loop. |
| `CredentialsStep` in `ProvisionWizard.tsx` | Add a primary "Connect to Azure" button above the manual form. On success, fill the form state and kick off the existing `onValidate()` so the wizard's `canProceed` flips to true. |
| `globals.css` / design tokens | Probably nothing — reuse existing modal, button, and input styles. |

**Nothing else moves.**  The rest of the wizard (configuration, deploy,
WebSocket progress) is unchanged. The manual credentials form stays in
place as a power-user fallback and as the path the existing test suite
exercises.
