"use client";

import { useState, useEffect, useCallback } from "react";
import {
  IconHome,
  IconPlus,
  IconSettings,
  IconChevronRight,
  IconChat,
  IconLoader,
  IconPlay,
  IconStop,
  IconExternalLink,
} from "./icons";
import {
  fetchOpenWebuiStatus,
  startOpenWebui,
  stopOpenWebui,
} from "@/app/lib/api";
import type { OpenWebuiState } from "@/app/lib/types";

const STORAGE_KEY = "privateai_sidebar_collapsed";

interface NavItem {
  id: string;
  label: string;
  page: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", page: "dashboard", icon: IconHome },
  { id: "deploy", label: "New Deployment", page: "provision", icon: IconPlus },
  { id: "settings", label: "Settings", page: "settings", icon: IconSettings },
];

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors
  }
}

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  onCollapsedChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    const stored = readCollapsed();
    setCollapsed(stored);
    setMounted(true);
    onCollapsedChange?.(stored);
  }, [onCollapsedChange]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      onCollapsedChange?.(next);
      return next;
    });
  }, [onCollapsedChange]);

  // Avoid hydration mismatch: render expanded by default, then correct on mount
  const isCollapsed = mounted ? collapsed : false;

  return (
    <aside
      className={`sidebar ${isCollapsed ? "sidebar-collapsed" : "sidebar-expanded"} fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface`}
      style={{ transition: "width 300ms ease" }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-lg font-bold text-foreground truncate">
          {isCollapsed ? "P" : "PrivateAI"}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.page;
            const Icon = item.icon;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.page)}
                  title={isCollapsed ? item.label : undefined}
                  className={`btn-ghost flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-[var(--accent-subtle)] text-accent"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={20}
                    className={`shrink-0 ${isActive ? "text-accent" : ""}`}
                  />
                  {!isCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Open WebUI status */}
      <SidebarWebUI collapsed={isCollapsed} />

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={toggleCollapsed}
          className="btn btn-ghost btn-icon w-full flex items-center justify-center"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconChevronRight
            size={18}
            className={`transition-transform duration-300 ${
              isCollapsed ? "" : "rotate-180"
            }`}
          />
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Open WebUI widget
// ---------------------------------------------------------------------------

function SidebarWebUI({ collapsed }: { collapsed: boolean }) {
  const [state, setState] = useState<OpenWebuiState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await fetchOpenWebuiStatus();
        if (active) setState(s);
      } catch {
        // ignore
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (!state) return;
    setActionLoading(true);
    try {
      if (state.status === "running") {
        await stopOpenWebui();
      } else {
        await startOpenWebui();
      }
      const s = await fetchOpenWebuiStatus();
      setState(s);
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  }, [state]);

  if (!state) return null;

  const isRunning = state.status === "running";
  const dotColor = isRunning
    ? "bg-[var(--success)]"
    : state.status === "error"
      ? "bg-[var(--error)]"
      : "bg-[var(--muted)]";

  if (collapsed) {
    return (
      <div className="border-t border-border p-2 flex flex-col items-center gap-1.5">
        <button
          onClick={handleToggle}
          disabled={actionLoading || state.status === "not_installed"}
          title={
            isRunning
              ? `Open WebUI running${state.connected_deployment_name ? ` — ${state.connected_deployment_name}` : ""}`
              : "Start Open WebUI"
          }
          className="btn btn-ghost btn-icon relative"
        >
          {actionLoading ? (
            <IconLoader size={16} className="text-[var(--muted)]" />
          ) : (
            <IconChat size={16} className={isRunning ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
          )}
          <span className={`absolute top-0.5 right-0.5 h-2 w-2 rounded-full ${dotColor}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <IconChat size={14} className="shrink-0 text-[var(--accent)]" />
          <span className="text-xs font-medium text-[var(--fg)] truncate">
            Open WebUI
          </span>
          <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
        </div>
        <div className="flex items-center gap-1">
          {isRunning && state.url && (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-icon btn-sm"
              title="Open in browser"
            >
              <IconExternalLink size={12} />
            </a>
          )}
          <button
            onClick={handleToggle}
            disabled={actionLoading || state.status === "not_installed" || state.status === "starting" || state.status === "stopping"}
            className="btn btn-ghost btn-icon btn-sm"
            title={isRunning ? "Stop" : "Start"}
          >
            {actionLoading ? (
              <IconLoader size={12} />
            ) : isRunning ? (
              <IconStop size={12} className="text-[var(--error)]" />
            ) : (
              <IconPlay size={12} className="text-[var(--success)]" />
            )}
          </button>
        </div>
      </div>

      {/* Connected deployment */}
      {isRunning && state.connected_deployment_name && (
        <p className="text-[10px] text-[var(--muted)] truncate pl-5">
          Connected to {state.connected_deployment_name}
        </p>
      )}

      {/* Error */}
      {state.status === "error" && (
        <p className="text-[10px] text-[var(--error)] truncate pl-5">
          {state.error}
        </p>
      )}

      {state.status === "not_installed" && (
        <p className="text-[10px] text-[var(--muted)] pl-5">
          Not installed
        </p>
      )}
    </div>
  );
}
