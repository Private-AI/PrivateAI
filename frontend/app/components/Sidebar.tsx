"use client";

import { useState, useEffect, useCallback } from "react";
import {
  IconHome,
  IconPlus,
  IconSettings,
  IconChevronRight,
  IconChat,
  IconLoader,
  IconExternalLink,
  IconLogout,
} from "./icons";
import { fetchOpenWebuiStatus } from "@/app/lib/api";
import { useAuth } from "@/components/AuthProvider";
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
  const { user, logout } = useAuth();
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

      {/* User + Logout */}
      {user && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <span className="text-xs text-muted truncate">{user.username}</span>
            )}
            <button
              onClick={logout}
              title="Log out"
              className="btn btn-ghost btn-icon btn-sm"
            >
              <IconLogout size={14} className="text-muted" />
            </button>
          </div>
        </div>
      )}

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
// Sidebar Open WebUI widget (hosted mode)
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

  const openWebuiUrl = process.env.NEXT_PUBLIC_OPEN_WEBUI_URL || "http://localhost:8080";

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
        <a
          href={openWebuiUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={isRunning ? "Open WebUI" : "Open WebUI (unavailable)"}
          className="btn btn-ghost btn-icon relative"
        >
          <IconChat size={16} className={isRunning ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
          <span className={`absolute top-0.5 right-0.5 h-2 w-2 rounded-full ${dotColor}`} />
        </a>
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
        <a
          href={openWebuiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-icon btn-sm"
          title="Open in browser"
        >
          <IconExternalLink size={12} />
        </a>
      </div>

      {isRunning && state.connected_deployment_name && (
        <p className="text-[10px] text-[var(--muted)] truncate pl-5">
          Connected to {state.connected_deployment_name}
        </p>
      )}

      {state.status === "error" && (
        <p className="text-[10px] text-[var(--error)] truncate pl-5">
          {state.error}
        </p>
      )}
    </div>
  );
}
