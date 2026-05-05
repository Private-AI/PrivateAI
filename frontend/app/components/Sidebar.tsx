"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "@/app/lib/colors";
import { useWindowWidth } from "@/app/lib/useWindowWidth";
import {
  IconHome,
  IconPlus,
  IconPresentation,
  IconSettings,
  IconChevronRight,
  IconChat,
  IconLoader,
  IconPlay,
  IconStop,
  IconPower,
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
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home",         label: "Dashboard",       page: "dashboard",     icon: IconHome },
  { id: "deploy",       label: "New Deployment",  page: "provision",     icon: IconPlus },
  { id: "presentation", label: "Presentation",    page: "presentation",  icon: IconPresentation },
  { id: "settings",     label: "Settings",        page: "settings",      icon: IconSettings },
];

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}

function writeCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
}

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onLogout?: () => void;
}

export default function Sidebar({ currentPage, onNavigate, onCollapsedChange, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const stored = readCollapsed();
    setCollapsed(stored);
    setMounted(true);
    onCollapsedChange?.(stored);
  }, [onCollapsedChange]);

  const handleMobileNavigate = useCallback((page: string) => {
    setMobileOpen(false);
    onNavigate(page);
  }, [onNavigate]);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
    onCollapsedChange?.(next);
  }, [collapsed, onCollapsedChange]);

  const isCollapsed = mounted ? collapsed : false;
  const showLabels = isMobile || !isCollapsed;
  const sidebarWidth = isCollapsed ? 64 : 220;

  return (
    <>
      {/* Mobile hamburger button — shown when sidebar is closed */}
      {isMobile && !mobileOpen && (
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          style={{
            position: "fixed", top: 14, left: 14, zIndex: 50,
            width: 40, height: 40,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, cursor: "pointer", color: COLORS.textPrimary,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="2" y1="4.5" x2="16" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="13.5" x2="16" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 41,
            background: "rgba(0,0,0,0.55)",
          }}
        />
      )}

      <aside style={{
        position: "fixed", left: 0, top: 0,
        zIndex: isMobile ? 42 : 40,
        width: isMobile ? 220 : sidebarWidth,
        height: "100vh",
        display: "flex", flexDirection: "column",
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        transition: isMobile ? "transform 300ms ease" : "width 300ms ease",
        transform: isMobile ? (mobileOpen ? "translateX(0)" : "translateX(-100%)") : "none",
        overflow: "hidden",
      }}>

        {/* Logo */}
        <div style={{
          height: 60, flexShrink: 0,
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: isCollapsed && !isMobile ? "0 14px" : "0 16px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/logo-icon-transparent.svg"
              width={32} height={32}
              alt="PrivateAI"
              style={{ display: "block", flexShrink: 0 }}
            />
            {showLabels && (
              <span style={{
                marginLeft: 8, fontFamily: "var(--font-syne), Outfit, sans-serif",
                fontSize: 15, fontWeight: 800, color: COLORS.textPrimary,
                letterSpacing: "-0.02em", whiteSpace: "nowrap",
              }}>
                Private<span style={{ color: COLORS.indigo }}>AI</span>
              </span>
            )}
          </div>
          {isMobile && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.textMuted, padding: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
          <ul style={{ listStyle: "none", margin: 0, padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.page;
              const isHovered = hoveredItem === item.id;
              const Icon = item.icon;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    title={!showLabels ? item.label : undefined}
                    onClick={() => isMobile ? handleMobileNavigate(item.page) : onNavigate(item.page)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    style={{
                      width: "100%",
                      display: "flex", alignItems: "center",
                      gap: 10,
                      padding: !showLabels ? "10px 0" : "10px 12px",
                      justifyContent: !showLabels ? "center" : "flex-start",
                      background: isActive
                        ? "rgba(99,102,241,0.12)"
                        : isHovered
                          ? COLORS.bgCardHover
                          : "transparent",
                      border: "none", borderRadius: 10, cursor: "pointer",
                      color: isActive ? COLORS.indigoLight : isHovered ? COLORS.textSecondary : COLORS.textMuted,
                      fontSize: 13, fontWeight: isActive ? 600 : 500,
                      fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    <Icon
                      size={18}
                      style={{
                        color: isActive ? COLORS.indigoLight : isHovered ? COLORS.textSecondary : COLORS.textMuted,
                        flexShrink: 0,
                      }}
                    />
                    {showLabels && (
                      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* AI engine status */}
        <SidebarWebUI collapsed={!showLabels} />

        {/* Logout */}
        {onLogout && (
          <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "6px 8px", flexShrink: 0 }}>
            <button
              type="button"
              title="Sign out"
              onClick={onLogout}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: !showLabels ? "center" : "flex-start",
                gap: 10, padding: !showLabels ? "10px 0" : "10px 12px",
                background: "none", border: "none", cursor: "pointer",
                borderRadius: 10, color: COLORS.textMuted,
                fontSize: 13, fontWeight: 500, fontFamily: "inherit",
              }}
            >
              <IconPower size={16} style={{ color: COLORS.textMuted, flexShrink: 0 }} />
              {showLabels && <span>Sign out</span>}
            </button>
          </div>
        )}

        {/* Collapse toggle — desktop only */}
        {!isMobile && (
          <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: 8, flexShrink: 0 }}>
            <button
              type="button"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleCollapsed}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", cursor: "pointer",
                padding: 8, borderRadius: 8, color: COLORS.textMuted,
              }}
            >
              <IconChevronRight
                size={15}
                style={{
                  color: COLORS.textMuted,
                  transition: "transform 0.3s ease",
                  transform: isCollapsed ? "none" : "rotate(180deg)",
                }}
              />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// AI engine status widget
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
      } catch {}
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => { active = false; clearInterval(id); };
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
    } catch {} finally {
      setActionLoading(false);
    }
  }, [state]);

  if (!state) return null;

  const isRunning = state.status === "running";
  const dotColor = isRunning ? "#4ade80" : state.status === "error" ? "#f87171" : COLORS.textMuted;
  const canToggle = !actionLoading && state.status !== "not_installed" && state.status !== "starting" && state.status !== "stopping";

  if (collapsed) {
    return (
      <div style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: "10px 0",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <button
          type="button"
          onClick={canToggle ? handleToggle : undefined}
          disabled={!canToggle}
          title={
            isRunning
              ? `AI engine${state.connected_deployment_name ? ` — ${state.connected_deployment_name}` : ""}`
              : "Start AI engine"
          }
          style={{
            position: "relative", display: "flex",
            alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 9,
            background: "none", border: "none",
            cursor: canToggle ? "pointer" : "default",
          }}
        >
          {actionLoading
            ? <IconLoader size={15} style={{ color: COLORS.textMuted }} />
            : <IconChat size={15} style={{ color: isRunning ? COLORS.indigoLight : COLORS.textMuted }} />
          }
          <span style={{
            position: "absolute", top: 5, right: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: dotColor, border: `2px solid ${COLORS.bg}`,
          }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      borderTop: `1px solid ${COLORS.border}`,
      padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 6,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconChat size={13} style={{ color: isRunning ? COLORS.indigoLight : COLORS.textMuted, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary, flex: 1, whiteSpace: "nowrap" }}>
          AI engine
        </span>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: dotColor,
          boxShadow: isRunning ? `0 0 5px ${dotColor}` : "none",
          display: "inline-block",
        }} />
        <button
          type="button"
          onClick={canToggle ? handleToggle : undefined}
          disabled={!canToggle}
          title={isRunning ? "Stop" : "Start"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6,
            background: "none", border: `1px solid ${COLORS.border}`,
            cursor: canToggle ? "pointer" : "default",
          }}
        >
          {actionLoading
            ? <IconLoader size={11} style={{ color: COLORS.textMuted }} />
            : isRunning
              ? <IconStop size={11} style={{ color: "#f87171" }} />
              : <IconPlay size={11} style={{ color: "#4ade80" }} />
          }
        </button>
      </div>

      {isRunning && state.connected_deployment_name && (
        <p style={{
          fontSize: 10, color: COLORS.textMuted, margin: 0, paddingLeft: 21,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {state.connected_deployment_name}
        </p>
      )}
      {state.status === "error" && (
        <p style={{
          fontSize: 10, color: "#f87171", margin: 0, paddingLeft: 21,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          AI Engine encountered an error
        </p>
      )}
      {state.status === "not_installed" && (
        <p style={{ fontSize: 10, color: COLORS.textMuted, margin: 0, paddingLeft: 21 }}>
          Not installed
        </p>
      )}
    </div>
  );
}
