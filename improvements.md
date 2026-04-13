# Frontend Improvements

Prioritized list of improvements for the PrivateAI desktop application.

---

## 1. Embedded Terminal (xterm.js)

**Status:** Implemented

Instead of just showing the SSH command string, embed an actual SSH
terminal in a tab/panel using xterm.js + a backend WebSocket proxy. This
lets users SSH into their VM without leaving the app.

**Implementation:**
- Backend: WebSocket endpoint at `/api/v1/deployments/{id}/terminal` that
  bridges to the VM via Paramiko
- Frontend: xterm.js + xterm-addon-fit in a `TerminalPanel` component
  rendered from the dashboard deployment card

---

## 2. Embedded Open WebUI Iframe

**Status:** Implemented

When Open WebUI is deployed, show it in an embedded iframe tab on the
dashboard so users can chat with their models without opening a browser.

**Implementation:**
- `WebUIPanel` component with a sandboxed iframe pointing at the Open
  WebUI endpoint
- Toolbar with reload, open-in-browser, and close buttons
- Loading state while the iframe content loads

---

## 3. Cost Estimation Panel

**Status:** Not started

Show estimated hourly and monthly cost for the selected VM size during the
provisioning wizard, and a running cost counter on the dashboard for
active deployments.

- Add a `cost_per_hour` field to the VM profile data
- Show cost breakdown in the wizard config step
- Dashboard card shows elapsed time * hourly rate

---

## 4. Notification System

**Status:** Not started

Toast notifications for async events: deployment complete, deployment
failed, VM auto-shutdown triggered, action succeeded. These should persist
briefly and be dismissible.

- Global notification context/provider
- Slide-in toast component anchored to bottom-right
- Auto-dismiss after 5 seconds with progress indicator

---

## 5. Deployment Detail Page

**Status:** Not started

Clicking a deployment card should open a dedicated detail view with: full
provisioning step timeline, setup step timeline, validation results, raw
logs, and a "re-run setup" button.

- New `/deployment/{id}` page or panel
- Timeline component showing each step with timestamps and duration
- Collapsible log viewer for raw output

---

## 6. Model Management Page

**Status:** Not started

A page to pull/delete Ollama models on a running deployment without
re-running the full setup pipeline. Show model sizes, quantization info,
and download progress.

- Backend: new endpoints for listing/pulling/deleting models via SSH
- Frontend: model list with size, pull progress bar, delete button

---

## 7. Multi-Deployment Selection and Bulk Actions

**Status:** Not started

Checkboxes on deployment cards to stop/start/destroy multiple deployments
at once.

- Checkbox UI on each card
- Floating action bar when selections are active
- Parallel API calls with aggregated results

---

## 8. Auto-Shutdown in Provisioning Wizard

**Status:** Not started

Add a step or option in the config screen to set auto-shutdown time during
provisioning rather than requiring a separate action after deploy.

- Add `auto_shutdown_utc` field to `SetupConfig`
- Time picker in the wizard config step
- Backend calls `set_auto_shutdown` after setup completes

---

## 9. Light Mode Toggle

**Status:** Not started

The CSS already has a `.light` class. Add a theme toggle in the sidebar or
settings that switches between dark/light/system and persists the choice.

- Toggle button in sidebar footer
- `getSettings().theme` already exists in storage
- Apply class to `<html>` element on change

---

## 10. Credential Vault with Encryption

**Status:** Not started

Currently credentials are stored in plaintext in localStorage. Use the
Electron `safeStorage` API to encrypt credentials at rest using the OS
keychain.

- Electron main process: `safeStorage.encryptString` / `decryptString`
- IPC bridge: `electronAPI.encryptCredentials` / `decryptCredentials`
- Fallback to plaintext localStorage when running in browser (dev mode)

---

## 11. Export/Import Configuration

**Status:** Not started

Let users export their deployment config as a JSON file and import it
later. Useful for sharing configs across machines or teams.

- Export button on deployment detail page
- Import button on provisioning wizard (auto-fill all fields)
- Electron `dialog.showSaveDialog` / `showOpenDialog` for file picker

---

## 12. Real-Time Resource Monitoring

**Status:** Not started

After deployment, periodically poll or stream GPU utilization, memory
usage, disk usage, and Ollama request metrics. Show them in small
sparkline charts on the dashboard card.

- Backend: SSH-based metric collection endpoint
- Frontend: sparkline chart component (lightweight, no heavy charting lib)
- 30-second polling interval

---

## 13. Guided Troubleshooting

**Status:** Not started

When a deployment fails, show contextual help based on the error: quota
issues link to the Azure portal, SSH timeouts suggest checking NSG rules,
etc.

- Error pattern matching in the frontend
- Contextual help cards with links and suggested actions
- "Copy error details" button for support

---

## 14. Keyboard Shortcuts

**Status:** Not started

`Ctrl+N` for new deployment, `Ctrl+1/2/3` for sidebar navigation,
`Escape` to go back in the wizard. Show a shortcut hint overlay on `?`.

- Global keyboard event listener
- Shortcut overlay component
- Hint text on buttons and nav items

---

## 15. Onboarding Tour

**Status:** Not started

A brief guided overlay (4-5 steps) for first-time users pointing out the
sidebar, deployment cards, service links, and settings.

- Spotlight/tooltip component that highlights UI elements
- Step-through navigation with skip button
- Only shown once (persisted in localStorage)
