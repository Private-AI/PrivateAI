"use client";

import { COLORS } from "../lib/colors";
import { Card, Pill, PrimaryButton, GhostButton, AzureLogo, AWSLogo, GCPLogo, EvernodeLogo } from "../components/ui";
import type { ProviderInfo } from "../lib/types";
import WizardShell from "./WizardShell";
import { useWindowWidth } from "../lib/useWindowWidth";

interface Props {
  providers: ProviderInfo[];
  loading: boolean;
  error: string | null;
  selected: ProviderInfo | null;
  onSelect: (provider: ProviderInfo) => void;
  onBack: () => void;
}

const PROVIDER_META: Record<string, { desc: string; tag: string; logo: React.ReactNode; pillColor: "indigo" | "teal" | "lavender" }> = {
  azure: { desc: "Trusted by enterprise worldwide",       tag: "Most popular",   logo: <AzureLogo size={36} />,    pillColor: "indigo" },
  aws:   { desc: "Vast global infrastructure",            tag: "Highly scalable", logo: <AWSLogo size={36} />,      pillColor: "teal" },
  gcp:   { desc: "Industry-leading AI hardware",          tag: "Fast GPUs",       logo: <GCPLogo size={36} />,      pillColor: "lavender" },
};

const FALLBACK_META = { desc: "Alternative cloud hosting", tag: "Coming soon", logo: <EvernodeLogo size={36} />, pillColor: "indigo" as const };

export default function WizardStep1({ providers, loading, error, selected, onSelect, onBack }: Props) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const items = providers.length > 0 ? providers : [
    { id: "azure", display_name: "Microsoft Azure", regions: [], available: true },
    { id: "aws",   display_name: "Amazon AWS",       regions: [], available: false },
    { id: "gcp",   display_name: "Google Cloud",     regions: [], available: false },
    { id: "evernode", display_name: "Evernode",       regions: [], available: false },
  ];

  return (
    <WizardShell step={0} title="Where should your AI live?" subtitle="Pick the cloud service you already use, or the one that sounds most familiar.">
      {error && (
        <div style={{ padding: "12px 16px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "#f87171", fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 32 }}>
          {items.map((p) => {
            const meta = PROVIDER_META[p.id] ?? FALLBACK_META;
            const isSelected = selected?.id === p.id;
            const available = p.available !== false;
            return (
              <Card
                key={p.id}
                selected={isSelected}
                onClick={available ? () => onSelect(p) : undefined}
                style={{ opacity: available ? 1 : 0.45, cursor: available ? "pointer" : "default", padding: 20 }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  {meta.logo}
                  <Pill color={meta.pillColor}>{meta.tag}</Pill>
                </div>
                <div style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontWeight: 700, fontSize: 16, color: COLORS.textPrimary, marginBottom: 4 }}>{p.display_name}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>{meta.desc}</div>
                {isSelected && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: COLORS.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span style={{ color: COLORS.indigoLight, fontSize: 12, fontWeight: 600 }}>Selected</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <GhostButton onClick={onBack}>Back to Dashboard</GhostButton>
        <PrimaryButton onClick={() => selected && onSelect(selected)} disabled={!selected} size="lg">
          Continue
        </PrimaryButton>
      </div>
    </WizardShell>
  );
}
