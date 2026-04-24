# PrivateAI Frontend UI Implementation Specification

## Overview

This specification defines the exact UI changes agreed upon during the PrivateAI UI review meeting. It is scoped to the React frontend at `/home/kalaa/PrivateAI/frontend` and references the current codebase structure.

## Scope

| Area | Status |
|------|--------|
| A. Onboarding / Deployment Wizard | Keep infrastructure details in wizard. Refine copy but preserve technical depth for power users. |
| B. Deployment Progress Screen | **Option C**: Short labeled steps + optional advanced logs + engaging loading animation. |
| C. Dashboard / Machine Management | Single-machine-first layout. Multi-machine list hidden behind collapsible sidebar (only shown when `deployments.length > 1`). |
| D. Layout Structure | Remove redundant Open WebUI button from left sidebar. |
| E. Chat Entry Flow | "Connect & Chat" goes directly into chat / Open WebUI. No intermediate detour. |
| F. Privacy Banner | **Skipped** |

---

## A. Onboarding / Deployment Wizard

### Current State
The wizard lives in `app/provision/ProvisionWizard.tsx` with 4 steps:
1. Provider
2. Credentials
3. Configuration
4. Deploy

### Changes Required
1. **Preserve technical depth** — Do not remove infrastructure terminology from the wizard. The target user for this screen is expected to provide cloud credentials.
2. **Refine microcopy on Step 4 (Deploy)** — Keep step labels, but update the human-readable descriptions to be more benefit-oriented rather than purely technical.
   - Example mapping:
     - "Resource Group" → "Creating secure environment"
     - "Virtual Network" → "Setting up private networking"
     - "Virtual Machine" → "Provisioning your server"
     - "System Update" → "Preparing system"
     - "Ollama Setup" → "Installing AI runtime"
     - "Model Pull" → "Downloading your model"
3. **No structural changes** to Steps 1–3.

---

## B. Deployment Progress Screen

### Current State
`DeployStep` in `ProvisionWizard.tsx` renders a flat list of `provisionSteps` and `setupSteps` with icons (check, loader, X, empty circle). No animation beyond a basic fade-in.

### Target State
**Option C**: Short labeled steps + optional advanced logs + engaging loading animation.

### Implementation Details

#### 1. Add Deployment Animation Component
Create `app/components/deploy/DeployAnimation.tsx`:

```tsx
// Visual centerpiece for the deployment progress screen
// - Animated SVG or CSS-based illustration (e.g. server nodes lighting up, shield forming, progress ring)
// - Must work without external animation libraries (only Tailwind + CSS keyframes)
// - Height: ~160px, centered above the steps list
//
// Suggested approach: A multi-ring SVG where each ring pulses in sequence.
// Each ring corresponds to a deployment phase:
//   Ring 1: Infrastructure (provisioning steps)
//   Ring 2: Software Setup (setup steps)
//   Ring 3: Ready (success state)
//
// Color: uses --accent for active, --muted for inactive, --success for complete.
//
// The animation state is derived from:
//   - totalSteps = provisionSteps.length + setupSteps.length
//   - completedSteps = count of steps with status === "completed"
//   - currentPhase = "infra" | "software" | "ready"
```

Add corresponding keyframes to `globals.css`:

```css
@keyframes deploy-ring-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@keyframes deploy-ring-complete {
  0% { opacity: 0.5; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
```

#### 2. Redesign Step List
In `DeployStep`, replace the current flat list with:

- **Collapsed default view**: Show only the current active step label with a one-line human-friendly description.
- **Expandable advanced view**: A "Show Details" toggle button that reveals the full step list with technical labels and `detail` text.

```tsx
// Pseudocode for the new step list
<div className="card p-5">
  {/* Animated centerpiece */}
  <DeployAnimation
    phase={derivePhase(provisionSteps, setupSteps)}
    progress={computeProgress(provisionSteps, setupSteps)}
  />

  {/* Primary status line */}
  <div className="text-center mt-4">
    <p className="text-sm font-medium text-[var(--fg)]">
      {currentFriendlyLabel}
    </p>
    <p className="text-xs text-[var(--muted)] mt-1">
      {currentFriendlyDescription}
    </p>
  </div>

  {/* Advanced toggle */}
  <button
    type="button"
    className="btn btn-ghost btn-sm mt-4 w-full"
    onClick={() => setShowAdvanced(prev => !prev)}
  >
    {showAdvanced ? "Hide Details" : "Show Details"}
  </button>

  {/* Expanded advanced view */}
  {showAdvanced && (
    <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border-color)] pt-3">
      {/* Existing provisionSteps + setupSteps lists, unchanged */}
    </div>
  )}
</div>
```

#### 3. Friendly Label Mapping
Maintain a map in `DeployStep` (or a new `app/lib/deployLabels.ts`) that maps `step` identifiers to friendly labels:

| Step ID (backend) | Friendly Label | Friendly Description |
|---|---|---|
| `resource_group` | Creating secure environment | Isolating your resources |
| `security_group` | Configuring firewall | Locking down network access |
| `virtual_network` | Setting up private networking | Building internal communication |
| `public_ip` | Allocating address | Preparing external access |
| `network_interface` | Connecting network | Linking server to network |
| `virtual_machine` | Provisioning your server | Spinning up compute |
| `system_update` | Preparing system | Updating base packages |
| `install_drivers` | Installing GPU drivers | Enabling hardware acceleration |
| `setup_ollama` | Installing AI runtime | Setting up inference engine |
| `pull_model` | Downloading your model | Fetching {modelName} |

If a step ID is not in the map, fall back to the raw `label`.

#### 4. Success State
When `isComplete`, the animation transitions to a solid green checkmark/pulse. The primary CTA below it must be:

```tsx
<button
  type="button"
  className="btn btn-primary btn-lg w-full"
  onClick={() => onNavigate("dashboard")} // Dashboard handles direct chat open
>
  <IconChat size={16} />
  Connect & Chat
</button>
```

> **Note**: The actual direct-chat behavior is handled in the Dashboard (see Section E). The wizard just routes to Dashboard.

---

## C. Dashboard / Machine Management

### Current State
`app/dashboard/Dashboard.tsx` renders deployments in a responsive grid (`grid-cols-1 lg:grid-cols-2 xl:grid-cols-3`). All deployments are shown as equal cards. There is no concept of a "primary" machine.

### Target State
- **Single-machine-first**: One primary machine is shown prominently in the center.
- **Multi-machine sidebar**: If the user has more than one deployment, a collapsible sidebar appears listing all machines. If only one deployment exists, the sidebar is hidden entirely.
- **Nickname support**: Allow users to assign a nickname to each deployment. Persist to local storage.

### Implementation Details

#### 1. Update Types
In `app/lib/types.ts`, extend `DeploymentHistoryEntry` (or the stored history shape in `storage.ts`) to include an optional `nickname: string`.

#### 2. Create Machine Sidebar Component
Create `app/dashboard/MachineSidebar.tsx`:

```tsx
interface MachineSidebarProps {
  deployments: DeploymentView[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNicknameChange: (id: string, nickname: string) => void;
}

// - Only renders if deployments.length > 1
// - Collapsible: default state is collapsed (icon-only) when not hovered/focused
//   OR use an explicit toggle chevron
// - Position: left side of the main dashboard content area
// - Each item shows:
//     - Status dot (color-coded)
//     - Nickname (if set) or vm_name
//     - Provider badge
// - Active item gets accent border/background
// - Bottom of sidebar: "+ New Machine" button → navigates to provision
```

#### 3. Redesign Dashboard Layout
Refactor `Dashboard.tsx` render structure:

```tsx
<div className="flex h-full">
  {/* Machine Sidebar — conditionally rendered */}
  {deployments.length > 1 && (
    <MachineSidebar
      deployments={deployments}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onNicknameChange={handleNicknameChange}
    />
  )}

  {/* Main Content */}
  <div className="flex-1 flex flex-col gap-6 p-6">
    {/* Header with New Deployment button */}
    {/* Cost Summary Bar */}
    {/* Primary Machine Card — full width, larger */}
    {selectedDeployment && (
      <DeploymentCardPrimary
        deployment={selectedDeployment}
        onOpenChat={handleConnectAndChat}
        onOpenTerminal={handleOpenTerminal}
        // ... other handlers
      />
    )}
  </div>
</div>
```

#### 4. DeploymentCardPrimary
Create `app/dashboard/DeploymentCardPrimary.tsx`:

- This is a larger, more prominent version of the current `DeploymentCard`.
- Full width of the main content area.
- Surface area for:
  - Machine nickname (editable inline)
  - Status badge (larger)
  - Provider / Region / VM Size
  - Cost per hour
  - SSH command + copy + terminal button
  - **Connect & Chat** CTA (large, primary button)
  - Model Manager (expandable, same as current)
  - Action buttons: Start / Stop / Destroy / Refresh

#### 5. Remove Grid Layout
Delete the `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3` wrapper. The primary card is the only card shown in the main area.

#### 6. Nickname Persistence
In `app/lib/storage.ts`, add:

```ts
export function setDeploymentNickname(id: string, nickname: string): void {
  const history = getDeploymentHistory();
  const entry = history.find((h) => h.id === id);
  if (entry) {
    entry.nickname = nickname;
    saveDeploymentHistory(history);
  }
}
```

In `Dashboard.tsx`, `loadData` should read nicknames from history and merge them into `DeploymentView`.

---

## D. Layout Structure

### Current State
`app/components/Sidebar.tsx` contains `SidebarWebUI`, which renders an Open WebUI status widget with a link to the external URL. This is redundant because the user already accesses chat via the **Connect & Chat** button inside the deployment card.

### Changes Required

1. **Remove `SidebarWebUI` entirely** from `Sidebar.tsx`.
2. **Remove the Open WebUI nav item** if it exists in `NAV_ITEMS` (it does not currently, but verify).
3. **Keep the collapse toggle, user info, and main nav** (Home, New Deployment, Settings) unchanged.

Delete lines 128–129 in `Sidebar.tsx`:

```tsx
{/* Open WebUI status */}
<SidebarWebUI collapsed={isCollapsed} />
```

And delete the `SidebarWebUI` function/component entirely (lines 172–256).

> **Verification**: Ensure `IconChat`, `IconExternalLink`, and `fetchOpenWebuiStatus` imports are no longer needed in `Sidebar.tsx`. Remove unused imports.

---

## E. Chat Entry Flow

### Current State
There are two entry points to chat:
1. **DeploymentCard** (`Dashboard.tsx`): The "Connect & Chat" button calls `handleConnectAndChat`, which already opens `WebUIPanel` directly. **This is correct.**
2. **DeployStep success** (`ProvisionWizard.tsx`): The "Connect & Chat" button calls `onNavigate("dashboard")`. This routes to the Dashboard, requiring the user to click "Connect & Chat" again on the card.

### Changes Required

1. **In `DeployStep` success state** (`ProvisionWizard.tsx` lines 746–762):
   - Change the button `onClick` to navigate directly to Dashboard **and** trigger chat open for the newly created deployment.
   - The cleanest way: pass a callback prop `onDeployComplete` from `ProvisionWizard` to `DeployStep`.
   - `ProvisionWizard` knows the `deploymentId` from the WebSocket response. Store it in state.
   - When deployment completes, the success CTA becomes:

```tsx
<button
  type="button"
  className="btn btn-primary btn-lg w-full"
  onClick={() => onDeployComplete(deploymentId)}
>
  <IconChat size={16} />
  Connect & Chat
</button>
```

2. **In `ProvisionWizard` parent**:
   - `onDeployComplete` should:
     a. Save the deployment to history (already done).
     b. Call `connectOpenWebuiToDeployment(deploymentId, deploymentName)`.
     c. On success, set `openPanel` state in `page.tsx` to `{ type: "webui", url: result.state.url }`.
     d. Navigate to `dashboard`.

   Because `page.tsx` owns the layout and `Dashboard` is a child, the simplest approach is:
   - Lift `openPanel` state to `page.tsx` (or use a URL query param / React context).
   - Given the current architecture, the fastest path is to add an optional `autoConnectDeploymentId` state in `page.tsx`.
   - When navigating from `provision` → `dashboard`, pass the deployment ID:

```tsx
// In page.tsx
const [autoConnectId, setAutoConnectId] = useState<string | null>(null);

// In Dashboard props
<Dashboard
  onNavigate={handleNavigate}
  autoConnectId={autoConnectId}
  onAutoConnectHandled={() => setAutoConnectId(null)}
/>
```

   - In `Dashboard.tsx`, add a `useEffect` that watches `autoConnectId`. When set, call `handleConnectAndChat(autoConnectId, name)` and then invoke `onAutoConnectHandled()`.

3. **Alternative (simpler)**: Just change the DeployStep CTA to say "Go to Dashboard" and remove the false promise of direct chat. But per the meeting decision, we want direct chat.

**Recommended approach**: Use a React Context or simple prop drilling as shown above. Do not add a heavy state management library.

---

## Component File Inventory

### New Files
| File | Purpose |
|------|---------|
| `app/components/deploy/DeployAnimation.tsx` | SVG/CSS animation for deployment progress |
| `app/lib/deployLabels.ts` | Friendly label mapping for deployment steps |
| `app/dashboard/MachineSidebar.tsx` | Collapsible multi-machine sidebar |
| `app/dashboard/DeploymentCardPrimary.tsx` | Large, primary deployment card |

### Modified Files
| File | Changes |
|------|---------|
| `app/provision/ProvisionWizard.tsx` | Redesign `DeployStep`; add `onDeployComplete` prop; lift deployment ID state |
| `app/dashboard/Dashboard.tsx` | Remove grid; add `MachineSidebar`; add `DeploymentCardPrimary`; support `autoConnectId` |
| `app/components/Sidebar.tsx` | Remove `SidebarWebUI` widget and unused imports |
| `app/lib/storage.ts` | Add `setDeploymentNickname` helper |
| `app/lib/types.ts` | Add optional `nickname` to history entry type |
| `app/globals.css` | Add `deploy-ring-pulse` and `deploy-ring-complete` keyframes |
| `app/page.tsx` | Add `autoConnectId` state and pass to `Dashboard` |

---

## CSS / Animation Guidelines

- **No new dependencies**. The project currently has `next`, `react`, `react-dom`, `xterm`, `@xterm/*`, and `tailwindcss` v4. Do not add Framer Motion, Lottie, or other animation libraries.
- Use **CSS keyframes** and **Tailwind utilities** for all motion.
- The deployment animation should be a **pure SVG + CSS** component.
- Prefer `transform` and `opacity` for animations (GPU-accelerated).

---

## Data Flow Diagram (Text)

```
ProvisionWizard
  ├── Step 1–3: Unchanged
  └── Step 4 (DeployStep)
        ├── DeployAnimation (visual)
        ├── Friendly Status Line
        ├── [Show Details] → Advanced step list
        └── [Connect & Chat] → onDeployComplete(deploymentId)
                  ↓
page.tsx: setAutoConnectId(id) → setCurrentPage("dashboard")
                  ↓
Dashboard: useEffect sees autoConnectId
  ├── handleConnectAndChat(id, name)
  │         └── setOpenPanel({ type: "webui", url })
  └── onAutoConnectHandled()
                  ↓
WebUIPanel renders iframe/modal with Open WebUI
```

---

## Acceptance Criteria

### A. Wizard
- [ ] Steps 1–3 remain functionally unchanged.
- [ ] Step 4 displays friendly labels for known step IDs.
- [ ] Step 4 has a "Show Details / Hide Details" toggle that reveals the technical step list.

### B. Progress Screen
- [ ] An engaging animation is visible during deployment.
- [ ] Animation progresses visually as steps complete.
- [ ] Success state shows a clear completion animation.
- [ ] No external animation libraries are added.

### C. Dashboard
- [ ] With 0 deployments: Empty state is shown.
- [ ] With 1 deployment: No machine sidebar. One large primary card is shown.
- [ ] With 2+ deployments: Collapsible machine sidebar appears. User can select a machine.
- [ ] User can set/edit a nickname for each deployment.
- [ ] Nickname persists across reloads.

### D. Layout
- [ ] Open WebUI widget is removed from the left sidebar.
- [ ] Sidebar still shows Home, New Deployment, Settings, user info, collapse toggle.

### E. Chat Flow
- [ ] Clicking "Connect & Chat" from the DeployStep success screen opens chat directly.
- [ ] Clicking "Connect & Chat" from a DeploymentCard still works as before.
- [ ] No extra click or intermediate screen is required after deployment completes.

---

## Notes for Implementers

- The backend WebSocket already sends `provision_steps` and `setup_steps` with `status`, `label`, and `detail`. No backend changes are needed.
- `fetchOpenWebuiStatus` and `connectOpenWebuiToDeployment` in `app/lib/api.ts` are already implemented. Reuse them.
- When removing `SidebarWebUI`, also check `app/lib/api.ts` — `fetchOpenWebuiStatus` is still used by `Dashboard.tsx` to sync the connected deployment ID. **Do not delete the API function; only remove the sidebar UI widget.**
- The `DeploymentCard` component can be kept as-is for potential reuse, but `Dashboard.tsx` should switch to `DeploymentCardPrimary` for the main view.
