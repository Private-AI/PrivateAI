"use client";

import { useEffect, useState } from "react";
import { COLORS } from "../lib/colors";

interface PresentationScreenProps {
  onClose: () => void;
}

export default function PresentationScreen({ onClose }: PresentationScreenProps) {
  const [mode, setMode] = useState<"video" | "slides">("slides");
  const [deckAvailable, setDeckAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/deck/index.html", { method: "HEAD" })
      .then((r) => setDeckAvailable(r.ok))
      .catch(() => setDeckAvailable(false));
  }, []);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(99,102,241,0.18)" : "transparent",
    color: active ? COLORS.indigoLight : COLORS.textMuted,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s, color 0.15s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: COLORS.bg, display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/logo-icon-transparent.svg" width={26} height={26} alt="PrivateAI" style={{ display: "block" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: "var(--font-syne), Syne, sans-serif", letterSpacing: "-0.02em" }}>
            Presentation
          </span>

          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 3 }}>
            <button style={tabStyle(mode === "video")} onClick={() => setMode("video")}>
              Watch video
            </button>
            <button style={tabStyle(mode === "slides")} onClick={() => setMode("slides")}>
              Slide deck
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            color: COLORS.textMuted, fontSize: 13, padding: "6px 10px",
            borderRadius: 8, fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M6 3L2 7.5L6 12M2 7.5H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: "#000" }}>

        {/* YouTube video */}
        {mode === "video" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "32px 24px", gap: 20,
          }}>
            <iframe
              src="https://www.youtube.com/embed/4gIn9A5TkL4?rel=0&modestbranding=1"
              style={{ width: "100%", maxWidth: 900, aspectRatio: "16/9", border: "none", borderRadius: 12, flexShrink: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="PrivateAI – 3-minute pitch"
            />
            <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>
              3-minute pitch · PrivateAI Hackathon Final
            </p>
          </div>
        )}

        {/* Slide deck iframe */}
        {mode === "slides" && deckAvailable === true && (
          <iframe
            src="/deck/index.html"
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="autoplay"
            title="PrivateAI Slide Deck"
          />
        )}

        {/* Slides not built yet */}
        {mode === "slides" && deckAvailable === false && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, padding: 40,
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(99,102,241,0.1)", border: `1px solid rgba(99,102,241,0.2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="12" rx="2" stroke={COLORS.indigo} strokeWidth="1.5" />
                <path d="M7 19H15M11 15V19" stroke={COLORS.indigo} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Slide deck not built yet</p>
              <p style={{ color: COLORS.textMuted, fontSize: 13, margin: "0 0 20px", maxWidth: 380, lineHeight: 1.5 }}>
                Run <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>cd PrivateAI_Presentation && npm run build</code> to build the slide deck, then refresh.
              </p>
              <button
                onClick={() => setMode("video")}
                style={{
                  background: "rgba(99,102,241,0.12)", border: `1px solid rgba(99,102,241,0.25)`,
                  borderRadius: 10, padding: "10px 20px", color: COLORS.indigoLight,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Watch the YouTube video instead
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {mode === "slides" && deckAvailable === null && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.indigo, animation: "pulse-core 1.5s infinite" }} />
          </div>
        )}
      </div>
    </div>
  );
}
