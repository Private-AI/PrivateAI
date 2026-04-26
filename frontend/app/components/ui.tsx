"use client";

import { useState } from "react";
import { COLORS } from "../lib/colors";

export function Logo({ size = 28 }: { size?: number }) {
  const iconSize = size;
  const textHeight = Math.round(iconSize * 0.75);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/logo-icon-transparent.svg"
        width={iconSize}
        height={iconSize}
        alt="PrivateAI icon"
        style={{ display: "block" }}
      />
      <span style={{
        fontFamily: "var(--font-syne), Outfit, sans-serif",
        fontWeight: 800,
        fontSize: textHeight,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}>
        <span style={{ color: COLORS.textPrimary }}>Private</span>
        <span style={{ color: COLORS.indigo }}>AI</span>
      </span>
    </div>
  );
}

export function ShieldIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <path d="M60 10L20 28V58C20 82 38 103 60 110C82 103 100 82 100 58V28L60 10Z" fill="url(#shieldGrad)" opacity="0.15" />
      <path d="M60 10L20 28V58C20 82 38 103 60 110C82 103 100 82 100 58V28L60 10Z" stroke={COLORS.indigo} strokeWidth="1.5" opacity="0.6" />
      <circle cx="60" cy="60" r="20" fill={COLORS.indigo} opacity="0.2" />
      <circle cx="60" cy="60" r="12" fill={COLORS.indigo} opacity="0.5" />
      <circle cx="60" cy="58" r="4" fill="white" opacity="0.9" />
      <rect x="58" y="59" width="4" height="6" rx="2" fill="white" opacity="0.9" />
      <path d="M46 28V23C46 15.27 52.27 9 60 9C67.73 9 74 15.27 74 23V28" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <defs>
        <linearGradient id="shieldGrad" x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor={COLORS.indigo} />
          <stop offset="1" stopColor={COLORS.teal} />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AzureLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M13.6 4L6 24.5H12.5L22 12.5L13.6 4Z" fill="#0078D4" opacity="0.9" />
      <path d="M14.5 4L8 24.5H26L14.5 4Z" fill="#0078D4" opacity="0.6" />
      <path d="M6 24.5L14 19L12.5 24.5H6Z" fill="#0078D4" />
    </svg>
  );
}

export function AWSLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M10 19C7.5 17.5 6 15 6 12C6 8.13 9.13 5 13 5C16.87 5 20 8.13 20 12H22C22 7.03 17.97 3 13 3C8.03 3 4 7.03 4 12C4 15.7 6.1 18.9 9.2 20.4L10 19Z" fill="#FF9900" />
      <path d="M22 12C22 16.97 17.97 21 13 21C11.5 21 10.1 20.6 8.9 19.9L10 21.5C11.2 22 12.6 22.5 14 22.5C19.52 22.5 24 18 24 12.5L22 12Z" fill="#FF9900" opacity="0.7" />
      <path d="M4 24L8 22L26 24L22 26H4V24Z" fill="#FF9900" opacity="0.5" />
      <path d="M8 20L4 22V24H22L26 22L24 20" stroke="#FF9900" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function GCPLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M20.2 10H16L11 16L16 22H20.2C22.9 22 25 19.9 25 17.2V14.8C25 12.1 22.9 10 20.2 10Z" fill="#4285F4" />
      <path d="M11.8 10H16L11 16H7C7 12.7 9.1 10 11.8 10Z" fill="#EA4335" />
      <path d="M11 16H7C7 19.3 9.1 22 11.8 22H16L11 16Z" fill="#34A853" />
    </svg>
  );
}

export function EvernodeLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10" stroke="#6b7280" strokeWidth="1.5" opacity="0.5" />
      <path d="M10 16H22M16 10V22" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function StepProgress({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 40 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? "1" : "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: i < currentStep ? COLORS.indigo : "transparent",
              border: `2px solid ${i <= currentStep ? COLORS.indigo : COLORS.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.4s ease",
              boxShadow: i === currentStep ? `0 0 16px ${COLORS.indigo}60` : "none",
            }}>
              {i < currentStep ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <span style={{ fontSize: 12, color: i === currentStep ? COLORS.indigo : COLORS.textMuted, fontWeight: 600 }}>{i + 1}</span>
              )}
            </div>
            <span style={{ fontSize: 11, color: i <= currentStep ? COLORS.textSecondary : COLORS.textMuted, whiteSpace: "nowrap", fontWeight: i === currentStep ? 600 : 400 }}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < currentStep ? COLORS.indigo : COLORS.border, margin: "0 8px", marginBottom: 24, transition: "background 0.4s ease" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function Card({
  children, style = {}, hover = true, selected = false, onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hover?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
      style={{
        background: selected ? "rgba(99,102,241,0.12)" : isHovered ? COLORS.bgCardHover : COLORS.bgCard,
        border: `1px solid ${selected ? COLORS.indigo : isHovered ? COLORS.borderHover : COLORS.border}`,
        borderRadius: 16,
        padding: 24,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.25s ease",
        transform: isHovered && !selected ? "translateY(-2px)" : selected ? "translateY(-1px)" : "none",
        boxShadow: selected ? `0 0 0 1px ${COLORS.indigo}40, 0 8px 32px rgba(99,102,241,0.15)` : isHovered ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children, onClick, disabled, style = {}, size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  size?: "md" | "lg";
}) {
  const [hovered, setHovered] = useState(false);
  const padding = size === "lg" ? "16px 36px" : "12px 24px";
  const fontSize = size === "lg" ? 16 : 14;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: disabled ? "rgba(99,102,241,0.2)" : hovered ? "#4f46e5" : COLORS.indigo,
        color: disabled ? COLORS.textMuted : "white",
        border: "none",
        borderRadius: 12,
        padding,
        fontSize,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
        transform: hovered && !disabled ? "translateY(-1px)" : "none",
        boxShadow: hovered && !disabled ? "0 8px 24px rgba(99,102,241,0.4)" : disabled ? "none" : "0 4px 12px rgba(99,102,241,0.25)",
        letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children, onClick, style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
        color: COLORS.textSecondary,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "12px 24px",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s ease",
        fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Pill({ children, color = "indigo" }: { children: React.ReactNode; color?: "indigo" | "teal" | "lavender" | "green" }) {
  const colors = {
    indigo: { bg: "rgba(99,102,241,0.15)", text: COLORS.indigoLight, border: "rgba(99,102,241,0.3)" },
    teal:   { bg: "rgba(45,212,191,0.12)",  text: COLORS.teal,        border: "rgba(45,212,191,0.25)" },
    lavender: { bg: "rgba(167,139,250,0.12)", text: COLORS.lavender, border: "rgba(167,139,250,0.25)" },
    green:  { bg: "rgba(34,197,94,0.12)",   text: "#4ade80",          border: "rgba(34,197,94,0.25)" },
  };
  const c = colors[color];
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 100, padding: "4px 12px", fontSize: 12, fontWeight: 600, letterSpacing: "0.01em",
    }}>
      {children}
    </span>
  );
}

export function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: 500 }}>{value}</span>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.8,
    color: [COLORS.indigo, COLORS.teal, COLORS.lavender, "#f59e0b", "#ec4899"][Math.floor(Math.random() * 5)],
    size: 6 + Math.random() * 8,
    duration: 2 + Math.random() * 1.5,
    round: Math.random() > 0.5,
  }));
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, overflow: "hidden" }}>
      {pieces.map((p) => (
        <div key={p.id} style={{
          position: "absolute", top: -20, left: `${p.x}%`,
          width: p.size, height: p.size, background: p.color,
          borderRadius: p.round ? "50%" : "2px",
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          opacity: 0,
        }} />
      ))}
    </div>
  );
}
