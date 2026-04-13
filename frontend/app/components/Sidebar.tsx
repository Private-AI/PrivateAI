"use client";

import { useState, useEffect, useCallback } from "react";
import { IconHome, IconPlus, IconSettings, IconChevronRight } from "./icons";

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
