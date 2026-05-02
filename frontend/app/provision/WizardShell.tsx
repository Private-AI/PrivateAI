"use client";

import { COLORS } from "../lib/colors";
import { Logo, StepProgress } from "../components/ui";
import { useWindowWidth } from "../lib/useWindowWidth";

const WIZARD_STEPS = ["Cloud", "Credentials", "Configure", "Deploy"];

export default function WizardShell({
  step, title, subtitle, children,
}: {
  step: number;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", alignItems: "center", padding: isMobile ? "16px 20px" : "24px 64px" }}>
        <Logo />
      </nav>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? "24px 16px 40px" : "40px 24px 60px" }}>
        <div style={{ width: "100%", maxWidth: 600 }}>
          <StepProgress steps={WIZARD_STEPS} currentStep={step} />
          {title && (
            <h2 style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: isMobile ? 22 : 32, fontWeight: 700, color: COLORS.textPrimary, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>{subtitle}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
