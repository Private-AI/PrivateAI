"use client";

import { useState, useEffect } from "react";
import { COLORS } from "../lib/colors";
import { Card, Pill, PrimaryButton, GhostButton } from "../components/ui";
import type { VMSize, ProviderInfo } from "../lib/types";
import WizardShell from "./WizardShell";

export interface ConfigFormState {
  region: string;
  vmSize: string;
  model: string;
  securityLevel: string;
}

interface Props {
  provider: ProviderInfo;
  form: ConfigFormState;
  onChange: (update: Partial<ConfigFormState>) => void;
  vmSizes: VMSize[];
  vmSizesLoading: boolean;
  vmSizeMessage: string | null;
  onModelChange: (model: string) => void;
  onBack: () => void;
  onDeploy: () => void;
}

const PRESET_MODELS = [
  { id: "tinyllama", name: "TinyLlama 1.1B", tag: "Recommended", tagColor: "teal" as const, desc: "Fast, lightweight, and perfect for everyday conversations. Great for most people.", speed: 95, quality: 62 },
  { id: "mistral",   name: "Mistral 7B",     tag: "Balanced",     tagColor: "indigo" as const, desc: "A great middle ground. Smarter responses, still snappy. Good for complex questions.", speed: 72, quality: 82 },
  { id: "llama3",    name: "Llama 3 8B",     tag: "Most capable", tagColor: "lavender" as const, desc: "The most powerful option. Best for detailed writing, research, and deep thinking.", speed: 55, quality: 95 },
];

export default function WizardStep3({ provider, form, onChange, vmSizes, vmSizesLoading, vmSizeMessage, onModelChange, onBack, onDeploy }: Props) {
  const [userPickedModel, setUserPickedModel] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    if (userPickedModel || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, userPickedModel]);

  useEffect(() => {
    if (!userPickedModel && countdown <= 0 && !form.model) {
      onModelChange("tinyllama");
    }
  }, [countdown, userPickedModel, form.model, onModelChange]);

  const selectPreset = (id: string) => {
    setUserPickedModel(true);
    onModelChange(id);
  };

  const canDeploy = !!form.model && !!form.region && !!form.vmSize;

  return (
    <WizardShell step={2} title="Configure your deployment" subtitle="Choose your AI model and cloud region. You can change models any time after setup.">
      {/* Model selection */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>AI Model</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRESET_MODELS.map((m) => (
            <Card key={m.id} selected={form.model === m.id} onClick={() => selectPreset(m.id)} style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.textPrimary }}>{m.name}</span>
                    <Pill color={m.tagColor}>{m.tag}</Pill>
                    {m.id === "tinyllama" && !userPickedModel && countdown > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${COLORS.teal}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                          <svg width="22" height="22" viewBox="0 0 22 22" style={{ position: "absolute", top: -1, left: -1, transform: "rotate(-90deg)" }}>
                            <circle cx="11" cy="11" r="9" fill="none" stroke={COLORS.teal} strokeWidth="2"
                              strokeDasharray={`${(countdown / 5) * 56.5} 56.5`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s linear" }} />
                          </svg>
                          <span style={{ fontSize: 9, color: COLORS.teal, fontWeight: 700 }}>{countdown}</span>
                        </div>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>auto</span>
                      </div>
                    )}
                  </div>
                  <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>{m.desc}</p>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 3 }}>Speed</div>
                      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                        <div style={{ width: `${m.speed}%`, height: "100%", background: COLORS.teal, borderRadius: 2, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 3 }}>Smarts</div>
                      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                        <div style={{ width: `${m.quality}%`, height: "100%", background: COLORS.lavender, borderRadius: 2, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Custom model input */}
          <Card style={{ padding: 16 }}>
            <label style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Custom model</label>
            <input
              type="text"
              placeholder="e.g. gemma3, llama3:13b, phi3..."
              value={customModel}
              onChange={(e) => {
                setCustomModel(e.target.value);
                if (e.target.value) { setUserPickedModel(true); onModelChange(e.target.value); }
              }}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${form.model === customModel && customModel ? COLORS.indigo : COLORS.border}`, borderRadius: 8, padding: "9px 14px", color: COLORS.textPrimary, fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => (e.target.style.borderColor = COLORS.indigo)}
              onBlur={(e) => (e.target.style.borderColor = form.model === customModel && customModel ? COLORS.indigo : COLORS.border)}
            />
          </Card>
        </div>
      </div>

      {/* Region */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Region</div>
        <select
          value={form.region}
          onChange={(e) => onChange({ region: e.target.value })}
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "11px 14px", color: form.region ? COLORS.textPrimary : COLORS.textMuted, fontSize: 14, outline: "none", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", cursor: "pointer" }}
          onFocus={(e) => (e.target.style.borderColor = COLORS.indigo)}
          onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
        >
          <option value="">Select a region...</option>
          {provider.regions.map((r) => (
            <option key={r.id} value={r.id} style={{ background: "#0f1128" }}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* VM sizes */}
      {form.region && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>VM Size</div>
          {vmSizesLoading && <div style={{ color: COLORS.textMuted, fontSize: 13, padding: "12px 0" }}>Loading available sizes...</div>}
          {vmSizeMessage && !vmSizesLoading && (
            <div style={{ padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, color: COLORS.textSecondary, fontSize: 13 }}>
              {vmSizeMessage}
            </div>
          )}
          {vmSizes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>
              {vmSizes.map((vm) => (
                <Card
                  key={vm.id}
                  selected={form.vmSize === vm.id}
                  onClick={vm.available ? () => onChange({ vmSize: vm.id }) : undefined}
                  style={{ padding: 14, opacity: vm.available ? 1 : 0.5, cursor: vm.available ? "pointer" : "default" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{vm.display_name}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{vm.vcpus} vCPU · {vm.memory_gb}GB RAM{vm.gpus ? ` · ${vm.gpus}× GPU` : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {vm.cost_per_hour !== undefined && (
                        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>${vm.cost_per_hour.toFixed(3)}/hr</span>
                      )}
                      {!vm.available && vm.availability_reason && (
                        <span style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 100, padding: "2px 8px" }}>
                          {vm.availability_reason.slice(0, 30)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onDeploy} disabled={!canDeploy} size="lg">Deploy</PrimaryButton>
      </div>
    </WizardShell>
  );
}
