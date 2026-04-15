import type {
  AzureCredentials,
  BudgetConfig,
  DeploymentStatus,
  ServiceEndpoints,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREFIX = "privateai_";
const SETTINGS_KEY = `${PREFIX}settings`;
const HISTORY_KEY = `${PREFIX}deployment_history`;
const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// ---------------------------------------------------------------------------
// Generic read / write helpers
// ---------------------------------------------------------------------------

function readJSON<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (!hasLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  theme: "dark" | "light" | "system";
  savedCredentials: AzureCredentials | null;
  lastProvider: string;
  defaultRegion: string;
  defaultModels: string[];
  budgetConfig: BudgetConfig | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  savedCredentials: null,
  lastProvider: "azure",
  defaultRegion: "eastus",
  defaultModels: [],
  budgetConfig: null,
};

export function getSettings(): AppSettings {
  const stored = readJSON<Partial<AppSettings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  writeJSON(SETTINGS_KEY, { ...current, ...settings });
}

// ---------------------------------------------------------------------------
// Deployment history
// ---------------------------------------------------------------------------

export interface DeploymentHistoryEntry {
  id: string;
  name: string;
  provider: string;
  region: string;
  vm_size: string;
  status: DeploymentStatus;
  created_at: string;
  public_ip: string;
  endpoints: ServiceEndpoints;
}

export function getDeploymentHistory(): DeploymentHistoryEntry[] {
  return readJSON<DeploymentHistoryEntry[]>(HISTORY_KEY, []);
}

export function addDeploymentToHistory(entry: DeploymentHistoryEntry): void {
  const history = getDeploymentHistory();
  // Remove duplicate if it already exists
  const filtered = history.filter((e) => e.id !== entry.id);
  // Add to front, cap at MAX_HISTORY
  const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
  writeJSON(HISTORY_KEY, updated);
}

export function updateDeploymentInHistory(
  id: string,
  updates: Partial<DeploymentHistoryEntry>,
): void {
  const history = getDeploymentHistory();
  const updated = history.map((e) =>
    e.id === id ? { ...e, ...updates } : e,
  );
  writeJSON(HISTORY_KEY, updated);
}

export function removeDeploymentFromHistory(id: string): void {
  const history = getDeploymentHistory();
  writeJSON(
    HISTORY_KEY,
    history.filter((e) => e.id !== id),
  );
}

export function clearHistory(): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(HISTORY_KEY);
}
