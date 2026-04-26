"use client";

import { useState, useEffect } from "react";
import { COLORS } from "../lib/colors";
import { ShieldIllustration, Confetti } from "../components/ui";
import WizardShell from "./WizardShell";

interface StepProgress {
  step: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  detail: string;
}

interface Props {
  provisionSteps: StepProgress[];
  setupSteps: StepProgress[];
  error: string | null;
  isComplete: boolean;
  isFailed: boolean;
  onComplete: () => void;
}

const TIPS = [
  "Your conversations are encrypted end-to-end. Even we can't read them.",
  "Your AI runs entirely in your own cloud account. Zero data touches our servers.",
  "You can delete everything from your cloud at any time. You're always in control.",
  "Open source models mean no hidden training on your data, ever.",
  "Your private AI works even if PrivateAI shuts down. You own the infrastructure.",
];

const MESSAGES = [
  "Brewing something special for you...",
  "Good things take a moment. This one's worth it.",
  "Setting up your personal AI corner of the internet.",
  "Almost there! Your private AI is taking shape.",
];

export default function WizardStep4({ provisionSteps, setupSteps, error, isComplete, isFailed, onComplete }: Props) {
  const [tipIdx, setTipIdx] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isComplete) setShowConfetti(true);
  }, [isComplete]);

  useEffect(() => {
    if (!isComplete) return;
    const t = setTimeout(onComplete, 1500);
    return () => clearTimeout(t);
  }, [isComplete, onComplete]);

  const allSteps = [...provisionSteps, ...setupSteps];
  const completedCount = allSteps.filter((s) => s.status === "completed").length;
  const progress = allSteps.length > 0 ? (completedCount / allSteps.length) * 100 : 0;

  return (
    <WizardShell step={3} title="" subtitle="">
      {showConfetti && <Confetti />}
      <div style={{ textAlign: "center", padding: "10px 0 30px" }}>
        {/* Animated central graphic */}
        <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 32px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid rgba(99,102,241,0.2)`, animation: "pulse-ring 3s ease-in-out infinite" }} />
          <div style={{ position: "absolute", inset: 16, borderRadius: "50%", border: `2px solid rgba(45,212,191,0.15)`, animation: "pulse-ring 3s ease-in-out infinite 1s" }} />
          <svg style={{ position: "absolute", inset: 0, animation: "spin-slow 8s linear infinite" }} width="180" height="180" viewBox="0 0 180 180" fill="none">
            <circle cx="90" cy="90" r="80" stroke="url(#spinGrad)" strokeWidth="2" strokeDasharray="80 420" strokeLinecap="round" />
            <defs>
              <linearGradient id="spinGrad" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor={COLORS.indigo} />
                <stop offset="1" stopColor={COLORS.teal} stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ animation: "deploy-glow 2s ease-in-out infinite" }}>
              <ShieldIllustration size={90} />
            </div>
          </div>
        </div>

        {isFailed ? (
          <>
            <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 24, fontWeight: 700, color: "#f87171", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Deployment failed</h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>
              {error ?? "An unexpected error occurred."}
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 8px", letterSpacing: "-0.02em", minHeight: 36, transition: "opacity 0.5s" }}>
              {isComplete ? "All done!" : MESSAGES[msgIdx]}
            </h2>
            <p style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 32 }}>
              {isComplete ? "Opening your private chat now." : "This usually takes 3–5 minutes. Grab a coffee!"}
            </p>
          </>
        )}

        {/* Progress bar */}
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 100, height: 6, marginBottom: 32, overflow: "hidden" }}>
          <div style={{ width: `${isFailed ? 100 : progress}%`, height: "100%", background: isFailed ? "linear-gradient(90deg, #f87171, #ef4444)" : `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.teal})`, borderRadius: 100, transition: "width 0.8s ease" }} />
        </div>

        {/* Steps list */}
        {allSteps.length > 0 && (
          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
            {allSteps.map((s) => {
              const isDone = s.status === "completed";
              const isActive = s.status === "in_progress";
              const isFail = s.status === "failed";
              return (
                <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12, opacity: isDone || isActive || isFail ? 1 : 0.3, transition: "opacity 0.5s" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: isDone ? COLORS.indigo : isFail ? "rgba(248,113,113,0.2)" : isActive ? "transparent" : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${isDone ? COLORS.indigo : isFail ? "#f87171" : isActive ? COLORS.indigo : "rgba(255,255,255,0.1)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isActive ? `0 0 12px ${COLORS.indigo}60` : "none",
                    transition: "all 0.4s ease",
                  }}>
                    {isDone && (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ animation: "tick-in 0.3s ease" }}>
                        <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    {isFail && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171" }} />}
                    {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.indigo, animation: "pulse-core 1.5s infinite" }} />}
                  </div>
                  <span style={{ fontSize: 14, color: isDone ? COLORS.textSecondary : isActive ? COLORS.textPrimary : isFail ? "#f87171" : COLORS.textMuted, fontWeight: isActive ? 600 : 400 }}>{s.label}</span>
                  {s.detail && (isActive || isDone) && (
                    <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: "auto", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.detail}</span>
                  )}
                </div>
              );
            })}
            {allSteps.length === 0 && (
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>Initializing deployment...</div>
            )}
          </div>
        )}

        {/* Rotating tip */}
        {!isFailed && (
          <div style={{ padding: "14px 18px", background: "rgba(99,102,241,0.07)", border: `1px solid rgba(99,102,241,0.15)`, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: COLORS.indigo, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Did you know</div>
            <div key={tipIdx} style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>{TIPS[tipIdx]}</div>
          </div>
        )}
      </div>
    </WizardShell>
  );
}
