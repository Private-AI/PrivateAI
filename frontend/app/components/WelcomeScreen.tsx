"use client";

import { IconShield, IconServer, IconGlobe } from "./icons";

interface WelcomeScreenProps {
  onStart: () => void;
}

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8">
      <div
        className="max-w-lg text-center"
        style={{ animation: "fade-in 0.4s ease-out both" }}
      >
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] bg-opacity-10">
          <IconShield size={32} className="text-[var(--accent)]" />
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          PrivateAI
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
          Deploy powerful open-weight AI models on secure cloud infrastructure
          with end-to-end hardware encryption. Your data stays completely
          private.
        </p>

        <div
          className="mt-6 flex justify-center gap-8 text-sm text-[var(--text-muted)]"
          style={{ animation: "fade-in 0.4s ease-out 0.15s both" }}
        >
          <div className="flex items-center gap-2">
            <IconShield size={16} className="text-[var(--success)]" />
            <span>Confidential VMs</span>
          </div>
          <div className="flex items-center gap-2">
            <IconServer size={16} className="text-[var(--accent)]" />
            <span>GPU Inference</span>
          </div>
          <div className="flex items-center gap-2">
            <IconGlobe size={16} className="text-[var(--warning)]" />
            <span>Open WebUI</span>
          </div>
        </div>

        <div style={{ animation: "slide-up 0.4s ease-out 0.25s both" }}>
          <button onClick={onStart} className="btn btn-primary btn-lg mt-10">
            Get Started
          </button>
        </div>

        <p
          className="mt-6 text-xs text-[var(--text-muted)]"
          style={{ animation: "fade-in 0.4s ease-out 0.4s both" }}
        >
          Currently supports Microsoft Azure. GCP and AWS coming soon.
        </p>
      </div>
    </div>
  );
}
