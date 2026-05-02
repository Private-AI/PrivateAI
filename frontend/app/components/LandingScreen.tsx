"use client";

import { useState, useEffect } from "react";
import { COLORS } from "../lib/colors";
import { Logo, AzureLogo, AWSLogo, GCPLogo, Pill, Card, PrimaryButton, GhostButton } from "./ui";
import { useWindowWidth } from "../lib/useWindowWidth";

export default function LandingScreen({ onGetStarted, onSignIn, onPresentation }: { onGetStarted: () => void; onSignIn?: () => void; onPresentation?: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const fade = (delay: number): React.CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "none" : "translateY(24px)",
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
  });

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  const orbSize = isMobile ? 180 : 280;
  const ringInset1 = isMobile ? 13 : 20;
  const ringInset2 = isMobile ? 26 : 40;
  const logoSize = isMobile ? 90 : 140;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, overflowX: "hidden" }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobile ? "16px 20px" : "24px 64px",
        position: "relative", zIndex: 10, ...fade(0),
      }}>
        <Logo />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onPresentation && (
            <button
              onClick={onPresentation}
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                color: COLORS.textMuted, fontSize: 13, fontFamily: "inherit",
                padding: isMobile ? "8px 10px" : "9px 14px", borderRadius: 8,
                transition: "color 0.15s, background 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.textSecondary; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textMuted; e.currentTarget.style.background = "none"; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 13H10M7 10V13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {!isMobile && "Pitch deck"}
            </button>
          )}
          <GhostButton onClick={onSignIn ?? onGetStarted} style={{ padding: isMobile ? "8px 14px" : "9px 20px", fontSize: 13 }}>Sign in</GhostButton>
          <PrimaryButton onClick={onGetStarted} style={{ padding: isMobile ? "8px 14px" : "9px 20px", fontSize: 13 }}>Get started</PrimaryButton>
        </div>
      </nav>

      <div style={{ textAlign: "center", padding: isMobile ? "40px 20px 0" : "60px 64px 0", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 100, left: "20%", width: 300, height: 300, background: "radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", width: orbSize, height: orbSize, margin: "0 auto 48px", ...fade(100) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid rgba(99,102,241,0.2)", animation: "pulse-ring 4s ease-in-out infinite" }} />
          <div style={{ position: "absolute", inset: ringInset1, borderRadius: "50%", border: "1px solid rgba(45,212,191,0.15)", animation: "pulse-ring 4s ease-in-out infinite 1.3s" }} />
          <div style={{ position: "absolute", inset: ringInset2, borderRadius: "50%", border: "1px solid rgba(167,139,250,0.12)", animation: "pulse-ring 4s ease-in-out infinite 2.6s" }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px dashed rgba(99,102,241,0.12)" }} />

          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -6, marginLeft: -6 }}>
            <div style={{ animation: "orbit1 8s linear infinite" }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS.teal, boxShadow: `0 0 12px ${COLORS.teal}` }} />
            </div>
          </div>
          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -5, marginLeft: -5 }}>
            <div style={{ animation: "orbit2 12s linear infinite" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.lavender, boxShadow: `0 0 10px ${COLORS.lavender}` }} />
            </div>
          </div>
          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -4, marginLeft: -4 }}>
            <div style={{ animation: "orbit3 16s linear infinite" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.indigoLight, boxShadow: `0 0 8px ${COLORS.indigoLight}` }} />
            </div>
          </div>

          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse-core 3s ease-in-out infinite" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/logo-icon-transparent.svg" width={logoSize} height={logoSize} alt="PrivateAI" style={{ display: "block" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32, flexWrap: "wrap", ...fade(150) }}>
          <Pill color="teal">No data training</Pill>
          <Pill color="indigo">Your cloud, your data</Pill>
          <Pill color="lavender">One-click setup</Pill>
        </div>

        <h1 style={{
          fontSize: isMobile ? 38 : 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 24px",
          background: `linear-gradient(135deg, ${COLORS.textPrimary} 0%, ${COLORS.textPrimary} 40%, ${COLORS.indigo} 60%, ${COLORS.teal} 80%, ${COLORS.lavender} 100%)`,
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "shimmer 5s linear infinite",
          fontFamily: "var(--font-syne), Syne, sans-serif",
          ...fade(200),
        }}>
          Your AI.<br />Completely private.
        </h1>

        <p style={{ color: COLORS.textSecondary, fontSize: isMobile ? 16 : 20, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 40px", fontWeight: 400, ...fade(250) }}>
          Chat with powerful AI that runs on your own private cloud. No one can read your conversations. Ready in minutes, no tech skills needed.
        </p>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 14, justifyContent: "center", alignItems: "stretch", marginBottom: 20, ...fade(300) }}>
          <PrimaryButton onClick={onGetStarted} size="lg" style={{ fontSize: isMobile ? 15 : 16, padding: isMobile ? "14px 28px" : "16px 40px" }}>
            Get started. It&apos;s easy
          </PrimaryButton>
          <GhostButton onClick={scrollToHowItWorks} style={{ fontSize: isMobile ? 15 : 16, padding: isMobile ? "14px 28px" : "16px 32px" }}>
            See how it works
          </GhostButton>
        </div>

        <p style={{ color: COLORS.textMuted, fontSize: 13, ...fade(350) }}>
          Your conversations are never stored on our servers. Runs entirely on your own cloud account.
        </p>

        {onPresentation && (
          <div style={{ marginTop: 20, ...fade(370) }}>
            <button
              onClick={onPresentation}
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 7,
                color: COLORS.textMuted, fontSize: 13, fontFamily: "inherit",
                padding: "6px 12px", borderRadius: 8,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 4.5L9.5 7L5.5 9.5V4.5Z" fill="currentColor" />
              </svg>
              Watch our 3-min pitch
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: isMobile ? 16 : 24, justifyContent: "center", alignItems: "center", marginTop: 40, flexWrap: "wrap", ...fade(400) }}>
          <span style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Works with</span>
          {[
            { logo: <AzureLogo size={isMobile ? 22 : 28} />, name: "Microsoft Azure" },
            { logo: <AWSLogo size={isMobile ? 22 : 28} />, name: "Amazon AWS" },
            { logo: <GCPLogo size={isMobile ? 22 : 28} />, name: "Google Cloud" },
          ].map(({ logo, name }) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
              {logo}
              {!isMobile && <span style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: 500 }}>{name}</span>}
            </div>
          ))}
        </div>
      </div>

      <div id="how-it-works" style={{ padding: isMobile ? "60px 20px 40px" : "100px 64px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60, ...fade(450) }}>
          <span style={{ color: COLORS.teal, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>How it works</span>
          <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: isMobile ? 28 : 44, fontWeight: 700, color: COLORS.textPrimary, margin: "12px 0 0", letterSpacing: "-0.02em" }}>
            Up and running in minutes
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 24, ...fade(500) }}>
          {[
            {
              num: "01", title: "Choose your cloud",
              desc: "Pick from Azure, AWS, or Google Cloud. You already have an account, or we'll walk you through creating one.",
              icon: (
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="12" fill="rgba(99,102,241,0.1)" />
                  <path d="M28 20H26C26 16.13 22.87 13 19 13C15.13 13 12 16.13 12 20H10L14 24.5L18 20L16 18C16.55 15.76 18.09 14 20 14C23.31 14 26 16.69 26 20H24L28 24.5Z" fill={COLORS.indigo} opacity="0.8" />
                </svg>
              ),
            },
            {
              num: "02", title: "Connect in one click",
              desc: "We guide you through linking your cloud account. Plain English instructions, one step at a time. Takes about 5 minutes.",
              icon: (
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="12" fill="rgba(45,212,191,0.1)" />
                  <circle cx="14" cy="20" r="4" stroke={COLORS.teal} strokeWidth="1.5" />
                  <circle cx="26" cy="20" r="4" stroke={COLORS.teal} strokeWidth="1.5" />
                  <line x1="18" y1="20" x2="22" y2="20" stroke={COLORS.teal} strokeWidth="1.5" />
                  <path d="M23 17L26 14L29 17" stroke={COLORS.teal} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              num: "03", title: "Chat privately",
              desc: "Your personal AI is ready. Everything runs in your cloud. Your conversations stay yours, forever.",
              icon: (
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="12" fill="rgba(167,139,250,0.1)" />
                  <path d="M10 14C10 12.9 10.9 12 12 12H28C29.1 12 30 12.9 30 14V24C30 25.1 29.1 26 28 26H22L16 30V26H12C10.9 26 10 25.1 10 24V14Z" stroke={COLORS.lavender} strokeWidth="1.5" />
                  <line x1="14" y1="18" x2="26" y2="18" stroke={COLORS.lavender} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
                  <line x1="14" y1="22" x2="22" y2="22" stroke={COLORS.lavender} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
                </svg>
              ),
            },
          ].map(({ num, title, desc, icon }) => (
            <Card key={num} style={{ padding: 28 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                {icon}
                <div>
                  <span style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>{num}</span>
                  <h3 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: "4px 0 8px", letterSpacing: "-0.01em" }}>{title}</h3>
                  <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 56, ...fade(550) }}>
          <PrimaryButton onClick={onGetStarted} size="lg">Get started. It&apos;s easy</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
