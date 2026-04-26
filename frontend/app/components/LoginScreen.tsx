"use client";

import { useState, useEffect, useRef } from "react";
import { COLORS } from "../lib/colors";
import { Logo } from "./ui";
import { login } from "../lib/auth";

interface LoginScreenProps {
  onLogin: () => void;
  onBack: () => void;
}

export default function LoginScreen({ onLogin, onBack }: LoginScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => setMounted(true), 40);
    setTimeout(() => emailRef.current?.focus(), 200);
  }, []);

  const fade = (delay: number): React.CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "none" : "translateY(20px)",
    transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setError(null);
    // Tiny artificial delay so it doesn't feel instant-jarring
    await new Promise((r) => setTimeout(r, 400));
    const session = login(email, password);
    setLoading(false);
    if (session) {
      onLogin();
    } else {
      setError("Incorrect email or password. Please try again.");
      setPassword("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", overflowX: "hidden" }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "24px 48px", zIndex: 10, ...fade(0),
      }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <Logo />
        </button>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10,
            padding: "8px 18px", color: COLORS.textMuted, fontSize: 13, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          ← Back
        </button>
      </nav>

      {/* Glow */}
      <div style={{
        position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)",
        width: 500, height: 500,
        background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 24px",
      }}>
        <div style={{
          width: "100%", maxWidth: 420,
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 24, padding: "40px 36px",
          ...fade(80),
        }}>

          {/* Icon */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24, ...fade(120) }}>
            <div style={{ animation: "pulse-core 3s ease-in-out infinite" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/logo-icon-transparent.svg" width={80} height={80} alt="PrivateAI" style={{ display: "block" }} />
            </div>
          </div>

          {/* Heading */}
          <div style={{ textAlign: "center", marginBottom: 32, ...fade(160) }}>
            <h1 style={{
              fontFamily: "var(--font-syne), Syne, sans-serif",
              fontSize: 26, fontWeight: 700, color: COLORS.textPrimary,
              letterSpacing: "-0.02em", margin: "0 0 8px",
            }}>
              Welcome back
            </h1>
            <p style={{ color: COLORS.textMuted, fontSize: 14, margin: 0 }}>
              Sign in to your PrivateAI workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...fade(200) }}>
              <label style={{
                display: "block", marginBottom: 6,
                fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${error ? "rgba(248,113,113,0.4)" : COLORS.border}`,
                  borderRadius: 10, color: COLORS.textPrimary,
                  fontSize: 14, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ ...fade(230) }}>
              <label style={{
                display: "block", marginBottom: 6,
                fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${error ? "rgba(248,113,113,0.4)" : COLORS.border}`,
                  borderRadius: 10, color: COLORS.textPrimary,
                  fontSize: 14, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <p style={{
                fontSize: 13, color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 8, padding: "10px 14px",
                margin: 0, animation: "fade-in 0.2s ease-out",
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: loading ? "rgba(99,102,241,0.5)" : COLORS.indigo,
                border: "none", borderRadius: 12, padding: "14px",
                color: "white", fontSize: 15, fontWeight: 600,
                cursor: loading ? "default" : "pointer", fontFamily: "inherit",
                boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.35)",
                transition: "background 0.2s, box-shadow 0.2s",
                ...fade(260),
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white",
                    display: "inline-block", animation: "spin-slow 0.7s linear infinite",
                  }} />
                  Signing in…
                </>
              ) : "Sign in"}
            </button>
          </form>

          {/* Privacy note */}
          <p style={{
            textAlign: "center", fontSize: 12, color: COLORS.textMuted,
            marginTop: 24, lineHeight: 1.5, ...fade(300),
          }}>
            Your workspace is private.<br />No data leaves your own cloud.
          </p>
        </div>
      </div>
    </div>
  );
}
