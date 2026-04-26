"use client";

import { useState } from "react";
import { COLORS } from "../lib/colors";
import { Card, PrimaryButton, GhostButton, AzureLogo } from "../components/ui";
import AzureLoginOverlay, { type AzureCliResult } from "./AzureLoginOverlay";
import WizardShell from "./WizardShell";

export interface CredentialFormState {
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  saveCredentials: boolean;
}

interface Props {
  form: CredentialFormState;
  onChange: (update: Partial<CredentialFormState>) => void;
  canProceed: boolean;
  connectedVia: string | null;
  onAzureCliConnect: (result: AzureCliResult) => void;
  onDisconnect: () => void;
  onBack: () => void;
  onNext: () => void;
  onValidate?: () => void;
  validating?: boolean;
  validationResult?: { valid: boolean; message: string } | null;
}

const FIELDS = [
  { id: "subscription_id" as const, label: "Subscription ID",  placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", hint: "In Azure Portal, click 'Subscriptions' in the left menu and copy the ID." },
  { id: "tenant_id"       as const, label: "Tenant ID",         placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", hint: "In Azure Portal, go to Azure Active Directory → Properties → Tenant ID." },
  { id: "client_id"       as const, label: "App (Client) ID",   placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", hint: "In App registrations, find your app and copy the Application (client) ID." },
  { id: "client_secret"   as const, label: "Client Secret",     placeholder: "Your client secret value",             hint: "In your App registration, go to Certificates & secrets. Create a new secret and copy its Value.", secret: true },
];

export default function WizardStep2({ form, onChange, canProceed, connectedVia, onAzureCliConnect, onDisconnect, onBack, onNext, onValidate, validating, validationResult }: Props) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showHint, setShowHint] = useState<string | null>(null);

  const handleSuccess = (result: AzureCliResult) => {
    setShowOverlay(false);
    onAzureCliConnect(result);
    setShowManual(true);
  };

  return (
    <WizardShell step={1} title="Connect your Azure account" subtitle="The fastest way is one click. Or fill in your credentials manually if you prefer full control.">
      {showOverlay && <AzureLoginOverlay onSuccess={handleSuccess} onCancel={() => setShowOverlay(false)} />}

      {/* Connect to Azure button */}
      {!connectedVia ? (
        <div style={{ marginBottom: 6 }}>
          <button onClick={() => setShowOverlay(true)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "linear-gradient(135deg, rgba(0,120,212,0.18) 0%, rgba(99,102,241,0.15) 100%)",
            border: "1px solid rgba(0,120,212,0.35)", borderRadius: 14,
            padding: "15px 24px", cursor: "pointer", transition: "all 0.2s",
            fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,120,212,0.6)"; e.currentTarget.style.background = "linear-gradient(135deg, rgba(0,120,212,0.26) 0%, rgba(99,102,241,0.2) 100%)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,120,212,0.35)"; e.currentTarget.style.background = "linear-gradient(135deg, rgba(0,120,212,0.18) 0%, rgba(99,102,241,0.15) 100%)"; }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(0,120,212,0.2)", border: "1px solid rgba(0,120,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AzureLogo size={20} />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Connect to Azure</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>Sign in with your Microsoft account — no copy-pasting required</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
              <path d="M6 4L10 8L6 12" stroke={COLORS.indigo} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          <div style={{ textAlign: "center", marginTop: 14, marginBottom: 10 }}>
            <button onClick={() => setShowManual((v) => !v)} style={{ background: "none", border: "none", color: COLORS.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", textDecoration: "underline", textUnderlineOffset: 3 }}>
              {showManual ? "Hide manual form" : "Enter credentials manually instead"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>Connected via Azure</div>
            <div style={{ color: COLORS.textMuted, fontSize: 12 }}>Signed in as {connectedVia}</div>
          </div>
          <button onClick={onDisconnect} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "4px 10px", color: COLORS.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif" }}>
            Disconnect
          </button>
        </div>
      )}

      {/* Divider */}
      {showManual && !connectedVia && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
          <span style={{ color: COLORS.textMuted, fontSize: 12 }}>or fill in manually</span>
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
        </div>
      )}

      {/* Manual form */}
      {showManual && (
        <div style={{ opacity: connectedVia ? 0.7 : 1, pointerEvents: connectedVia ? "none" : "auto" }}>
          {FIELDS.map((f) => {
            const val = form[f.id] ?? "";
            const isDone = val.length > 8;
            return (
              <div key={f.id} style={{ marginBottom: 10 }}>
                {isDone ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: connectedVia ? "rgba(34,197,94,0.05)" : "rgba(45,212,191,0.06)", border: `1px solid ${connectedVia ? "rgba(34,197,94,0.2)" : "rgba(45,212,191,0.2)"}`, borderRadius: 10 }}>
                    <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>{f.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: "monospace" }}>{f.secret ? "••••••••••••" : val.slice(0, 10) + "••••"}</span>
                      <button onClick={() => onChange({ [f.id]: "" })} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontFamily: "inherit" }}>
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <Card style={{ padding: 18 }}>
                    <label style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{f.label}</label>
                    <input
                      type={f.secret ? "password" : "text"}
                      placeholder={f.placeholder}
                      value={val}
                      onChange={(e) => onChange({ [f.id]: e.target.value })}
                      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", color: COLORS.textPrimary, fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                      onFocus={(e) => (e.target.style.borderColor = COLORS.indigo)}
                      onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
                    />
                    <button onClick={() => setShowHint(showHint === f.id ? null : f.id)} style={{ background: "none", border: "none", color: COLORS.teal, fontSize: 12, cursor: "pointer", marginTop: 8, padding: 0, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={COLORS.teal} strokeWidth="1.2" /><text x="7" y="11" textAnchor="middle" fill={COLORS.teal} fontSize="9" fontWeight="700">?</text></svg>
                      Where to find it
                    </button>
                    {showHint === f.id && (
                      <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(45,212,191,0.06)", borderRadius: 8, color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                        {f.hint}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            );
          })}

          {/* Validate credentials */}
          {onValidate && !connectedVia && (
            <div style={{ marginTop: 4, marginBottom: 4 }}>
              {validationResult && (
                <div style={{ marginBottom: 10, padding: "10px 14px", background: validationResult.valid ? "rgba(34,197,94,0.07)" : "rgba(248,113,113,0.07)", border: `1px solid ${validationResult.valid ? "rgba(34,197,94,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius: 10, color: validationResult.valid ? "#4ade80" : "#f87171", fontSize: 13 }}>
                  {validationResult.message}
                </div>
              )}
              <button
                onClick={onValidate}
                disabled={validating}
                style={{ width: "100%", background: "rgba(99,102,241,0.08)", border: `1px solid rgba(99,102,241,0.2)`, borderRadius: 10, padding: "11px 16px", color: validating ? COLORS.textMuted : COLORS.indigoLight, fontSize: 14, fontWeight: 600, cursor: validating ? "default" : "pointer", fontFamily: "var(--font-dm-sans), DM Sans, sans-serif", transition: "all 0.2s" }}
                onMouseEnter={(e) => { if (!validating) e.currentTarget.style.background = "rgba(99,102,241,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
              >
                {validating ? "Testing..." : "Test Credentials"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Security note */}
      <div style={{ marginTop: showManual ? 8 : 0, padding: "10px 16px", background: "rgba(99,102,241,0.06)", borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5V9C4 12.3 5.9 14.8 8 15.5C10.1 14.8 12 12.3 12 9V5L8 2Z" stroke={COLORS.indigo} strokeWidth="1.2" /></svg>
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>Your credentials are encrypted and sent directly to your cloud. We never see them.</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onNext} disabled={!canProceed} size="lg">Continue</PrimaryButton>
      </div>
    </WizardShell>
  );
}
