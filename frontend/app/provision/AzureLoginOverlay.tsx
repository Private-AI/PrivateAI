"use client";

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "../lib/colors";
import { AzureLogo, PrimaryButton } from "../components/ui";
import {
  startAzureCliLogin,
  fetchAzureCliLoginStatus,
  provisionAzureCliServicePrincipal,
  cancelAzureCliLogin,
} from "../lib/api";

export interface AzureCliResult {
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  display_name: string;
  user_name?: string;
  subscription_name?: string;
}

interface Props {
  onSuccess: (result: AzureCliResult) => void;
  onCancel: () => void;
}

type OverlayState = "loading" | "waiting" | "creating" | "success" | "error";

const Spinner = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: "spin-slow 0.9s linear infinite" }}>
    <circle cx="16" cy="16" r="13" stroke="rgba(99,102,241,0.2)" strokeWidth="3" />
    <path d="M16 3C16 3 27 5 29 16" stroke={COLORS.indigo} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default function AzureLoginOverlay({ onSuccess, onCancel }: Props) {
  const [state, setState] = useState<OverlayState>("loading");
  const [sessionId, setSessionId] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [userCode, setUserCode] = useState("");
  const [countdown, setCountdown] = useState(900);
  const [pulse, setPulse] = useState(false);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const [autoReady, setAutoReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState<AzureCliResult | null>(null);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const copyToClipboard = (text: string, key: "url" | "code") => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const openUrl = () => {
    window.open(verificationUrl, "_blank");
  };

  const autoStart = (verificationUrl: string, userCode: string) => {
    navigator.clipboard.writeText(userCode).catch(() => {});
    setAutoReady(true);
    setTimeout(() => {
      window.open(verificationUrl, "_blank");
    }, 2000);
  };

  // Start login on mount
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) { setErrorMsg("Backend did not respond. Please try again."); setState("error"); }
    }, 12000);
    startAzureCliLogin()
      .then((data) => {
        clearTimeout(timer);
        if (cancelled) return;
        setSessionId(data.session_id);
        setVerificationUrl(data.verification_url);
        setUserCode(data.user_code);
        setState("waiting");
        autoStart(data.verification_url, data.user_code);
      })
      .catch((err: Error) => {
        clearTimeout(timer);
        if (cancelled) return;
        setErrorMsg(err.message);
        setState("error");
      });
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Poll for status while waiting
  useEffect(() => {
    if (state !== "waiting" || !sessionId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await fetchAzureCliLoginStatus(sessionId);
        if (cancelled) return;

        if (
          status.status === "pending" &&
          status.verification_url &&
          status.user_code &&
          (
            status.verification_url !== verificationUrl ||
            status.user_code !== userCode
          )
        ) {
          setVerificationUrl(status.verification_url);
          setUserCode(status.user_code);
          setCountdown(900);
          autoStart(status.verification_url, status.user_code);
        }

        if (status.status === "authenticated" || status.status === "provisioned") {
          setState("creating");
          try {
            const creds = await provisionAzureCliServicePrincipal(sessionId);
            // Do NOT check `cancelled` here. setState("creating") above causes
            // the effect cleanup to run (setting cancelled=true) while this
            // await is still in-flight. Once provision starts, always complete it.
            const result: AzureCliResult = {
              ...creds,
              user_name: status.user_name,
              subscription_name: status.subscription_name,
            };
            setSuccessData(result);
            setState("success");
          } catch (err) {
            setErrorMsg((err as Error).message);
            setState("error");
          }
        } else if (status.status === "failed" || status.status === "expired") {
          if (!cancelled) {
            setErrorMsg(status.error ?? "Login expired or failed.");
            setState("error");
          }
        }
      } catch {
        // ignore transient errors
      }
    };

    const interval = setInterval(poll, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [state, sessionId, userCode, verificationUrl]);

  // Countdown timer
  useEffect(() => {
    if (state !== "waiting") return;
    if (countdown <= 0) { setState("error"); setErrorMsg("The code expired. Please try again."); return; }
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [state, countdown]);

  // Pulse animation
  useEffect(() => {
    if (state !== "waiting") return;
    const t = setInterval(() => setPulse((p) => !p), 1200);
    return () => clearInterval(t);
  }, [state]);

  const handleCancel = useCallback(() => {
    if (sessionId) cancelAzureCliLogin(sessionId).catch(() => {});
    onCancel();
  }, [sessionId, onCancel]);

  const handleRetry = () => {
    if (sessionId) cancelAzureCliLogin(sessionId).catch(() => {});
    setSessionId("");
    setVerificationUrl("");
    setUserCode("");
    setCountdown(900);
    setErrorMsg("");
    setAutoReady(false);
    setState("loading");

    startAzureCliLogin()
      .then((data) => {
        setSessionId(data.session_id);
        setVerificationUrl(data.verification_url);
        setUserCode(data.user_code);
        setState("waiting");
        autoStart(data.verification_url, data.user_code);
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setState("error");
      });
  };

  const CopyBtn = ({ text, id, label }: { text: string; id: "url" | "code"; label: string }) => (
    <button onClick={() => copyToClipboard(text, id)} style={{
      background: copied === id ? "rgba(45,212,191,0.15)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${copied === id ? "rgba(45,212,191,0.3)" : COLORS.border}`,
      borderRadius: 7, padding: "5px 10px", color: copied === id ? COLORS.teal : COLORS.textSecondary,
      fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
      transition: "all 0.2s", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
    }}>
      {copied === id ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={COLORS.teal} strokeWidth="1.5" strokeLinecap="round" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><rect x="1" y="4" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" /></svg>
      )}
      {copied === id ? "Copied!" : label}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(7,9,26,0.88)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
      <div style={{ width: 480, background: "#0f1128", border: `1px solid ${COLORS.border}`, borderRadius: 20, boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(0,120,212,0.15)", border: "1px solid rgba(0,120,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AzureLogo size={20} />
            </div>
            <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.textPrimary }}>Connect to Azure</span>
          </div>
          {state !== "loading" && state !== "creating" && (
            <button onClick={handleCancel} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "28px 24px 24px" }}>
          {state === "loading" && (
            <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><Spinner /></div>
              <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Starting Azure login...</p>
            </div>
          )}

          {state === "waiting" && (
            <div>
              <h3 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 8px", letterSpacing: "-0.02em" }}>Sign in to Azure</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
                Go to the URL below and enter the code to authenticate. Come back here when done.
              </p>

              {autoReady && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.2)", borderRadius: 10, marginBottom: 16 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke={COLORS.teal} strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <span style={{ color: COLORS.teal, fontSize: 13, fontWeight: 600 }}>Browser tab opened · Code copied to clipboard</span>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Login URL</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, fontFamily: "monospace" }}>{verificationUrl}</span>
                  <CopyBtn text={verificationUrl} id="url" label="Copy" />
                  <button onClick={openUrl} style={{
                    background: "rgba(255,255,255,0.06)", border: `1px solid ${COLORS.border}`, borderRadius: 7,
                    padding: "5px 10px", color: COLORS.textSecondary, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
                  }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4.5 2H2C1.45 2 1 2.45 1 3V9C1 9.55 1.45 10 2 10H8C8.55 10 9 9.55 9 9V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d="M6.5 1H10M10 1V4.5M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    Open
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Your one-time code</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(99,102,241,0.08)", border: `1px solid rgba(99,102,241,0.25)`, borderRadius: 12, padding: "16px 20px" }}>
                  <span style={{ flex: 1, fontFamily: "monospace", fontSize: 36, fontWeight: 700, letterSpacing: "0.18em", color: COLORS.textPrimary }}>{userCode}</span>
                  <CopyBtn text={userCode} id="code" label="Copy code" />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.teal, boxShadow: `0 0 8px ${COLORS.teal}`, opacity: pulse ? 1 : 0.3, transition: "opacity 0.6s" }} />
                  <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>Waiting for you to sign in...</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke={COLORS.textMuted} strokeWidth="1.2" /><path d="M6.5 3.5V7L8.5 8.5" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round" /></svg>
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: countdown < 120 ? "#f87171" : COLORS.textMuted }}>{fmt(countdown)}</span>
                </div>
              </div>

              <button onClick={handleCancel} style={{ width: "100%", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "11px", color: COLORS.textSecondary, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", transition: "background 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                Cancel
              </button>
            </div>
          )}

          {state === "creating" && (
            <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><Spinner /></div>
              <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Creating service principal...</p>
              <p style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 6 }}>Setting up secure access to your subscription</p>
            </div>
          )}

          {state === "success" && successData && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 20px" }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ animation: "tick-in 0.4s ease" }}>
                  <path d="M5 13L10.5 18.5L21 8" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Connected successfully</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: "0 0 24px" }}>Your Azure account is linked. Credentials have been set up automatically.</p>

              <div style={{ textAlign: "left", background: "rgba(255,255,255,0.03)", border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
                {[
                  { label: "Account", value: successData.user_name ?? successData.display_name },
                  { label: "Subscription", value: successData.subscription_name ?? successData.subscription_id.slice(0, 8) + "..." },
                  { label: "Tenant ID", value: successData.tenant_id.slice(0, 8) + "-..." },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                    <span style={{ color: COLORS.textMuted, fontSize: 13 }}>{row.label}</span>
                    <span style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: 500 }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <PrimaryButton onClick={() => onSuccess(successData)} size="lg" style={{ width: "100%", justifyContent: "center", display: "flex", fontSize: 15 }}>
                Done — continue setup
              </PrimaryButton>
            </div>
          )}

          {state === "error" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 20px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8V12M12 16H12.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="9" stroke="#f87171" strokeWidth="1.5" />
                </svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 8px" }}>Authentication failed</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>{errorMsg || "Something went wrong. Please try again."}</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleRetry} style={{ flex: 1, background: COLORS.indigo, border: "none", borderRadius: 10, padding: "12px", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif" }}>
                  Try again
                </button>
                <button onClick={handleCancel} style={{ flex: 1, background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px", color: COLORS.textSecondary, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
