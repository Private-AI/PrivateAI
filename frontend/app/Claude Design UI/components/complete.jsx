
// Screen 6: Setup Complete

function CompleteScreen({ onStartChat }) {
  const [mounted, setMounted] = React.useState(false);
  const [showConfetti, setShowConfetti] = React.useState(false);
  React.useEffect(() => {
    setTimeout(() => setMounted(true), 50);
    setTimeout(() => setShowConfetti(true), 400);
  }, []);

  const fade = (delay) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'none' : 'translateY(20px)',
    transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
  });

  const featureCards = [
    {
      title: 'End-to-end private',
      desc: 'Your messages are encrypted before they leave your browser. Only you can read them.',
      illustration: (
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="28" fill="rgba(99,102,241,0.1)"/>
          <path d="M36 14L20 21V37C20 49 27 58 36 61C45 58 52 49 52 37V21L36 14Z" fill="rgba(99,102,241,0.2)" stroke={COLORS.indigo} strokeWidth="1.5"/>
          <circle cx="36" cy="36" r="6" fill={COLORS.indigo} opacity="0.7"/>
          <circle cx="36" cy="34.5" r="2.5" fill="white" opacity="0.9"/>
          <rect x="34.5" y="36" width="3" height="4" rx="1.5" fill="white" opacity="0.9"/>
        </svg>
      ),
    },
    {
      title: 'AI running on your server',
      desc: 'The AI model lives entirely in your cloud account. We have no access whatsoever.',
      illustration: (
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="28" fill="rgba(45,212,191,0.08)"/>
          <line x1="18" y1="28" x2="30" y2="36" stroke={COLORS.teal} strokeWidth="1.2" opacity="0.5"/>
          <line x1="18" y1="36" x2="30" y2="36" stroke={COLORS.teal} strokeWidth="1.2" opacity="0.5"/>
          <line x1="18" y1="44" x2="30" y2="36" stroke={COLORS.teal} strokeWidth="1.2" opacity="0.5"/>
          <line x1="30" y1="30" x2="42" y2="36" stroke={COLORS.lavender} strokeWidth="1.2" opacity="0.5"/>
          <line x1="30" y1="36" x2="42" y2="36" stroke={COLORS.lavender} strokeWidth="1.2" opacity="0.5"/>
          <line x1="30" y1="42" x2="42" y2="36" stroke={COLORS.lavender} strokeWidth="1.2" opacity="0.5"/>
          <line x1="42" y1="36" x2="54" y2="36" stroke={COLORS.indigoLight} strokeWidth="1.5" opacity="0.6"/>
          <circle cx="18" cy="28" r="4" fill={COLORS.teal} opacity="0.6"/>
          <circle cx="18" cy="36" r="4" fill={COLORS.teal} opacity="0.8"/>
          <circle cx="18" cy="44" r="4" fill={COLORS.teal} opacity="0.6"/>
          <circle cx="30" cy="30" r="4" fill={COLORS.lavender} opacity="0.7"/>
          <circle cx="30" cy="36" r="5" fill={COLORS.indigo} opacity="0.9"/>
          <circle cx="30" cy="42" r="4" fill={COLORS.lavender} opacity="0.7"/>
          <circle cx="42" cy="36" r="5" fill={COLORS.indigoLight} opacity="0.9"/>
          <circle cx="54" cy="36" r="4" fill={COLORS.teal} opacity="0.8"/>
        </svg>
      ),
    },
    {
      title: 'Zero data leaves your cloud',
      desc: 'Everything stays inside your account. No logs, no telemetry, no third-party access.',
      illustration: (
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="28" fill="rgba(167,139,250,0.08)"/>
          <ellipse cx="36" cy="48" rx="18" ry="8" fill={COLORS.indigo} opacity="0.1"/>
          <path d="M48 36H46.2C46.2 30 41.3 25 35.5 25C30.5 25 26.3 28.5 25 33.4C22.2 33.9 20 36.5 20 39.6C20 43.1 22.9 46 26.4 46H48C50.8 46 53 43.8 53 41C53 38.2 50.8 36 48 36Z" fill={COLORS.lavender} opacity="0.25" stroke={COLORS.lavender} strokeWidth="1.2"/>
          <line x1="36" y1="46" x2="36" y2="54" stroke={COLORS.lavender} strokeWidth="1.2" strokeDasharray="2.5,2.5" opacity="0.5"/>
          <circle cx="36" cy="56" r="2.5" fill={COLORS.lavender} opacity="0.5"/>
          <path d="M29 32L32 28L29 24" stroke={COLORS.lavender} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 80px' }}>
      {showConfetti && <Confetti />}

      <nav style={{ width: '100%', maxWidth: 900, display: 'flex', alignItems: 'center', padding: '24px 0' }}>
        <Logo />
      </nav>

      <div style={{ width: '100%', maxWidth: 700, textAlign: 'center', ...fade(0) }}>
        {/* Trophy / celebration graphic */}
        <div style={{ position: 'relative', width: 160, height: 160, margin: '20px auto 36px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }}/>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse-core 2.5s ease-in-out infinite' }}>
            <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
              <circle cx="45" cy="45" r="40" fill="rgba(99,102,241,0.12)" stroke={COLORS.indigo} strokeWidth="1"/>
              <path d="M45 20L30 29V47C30 59 36 68 45 71C54 68 60 59 60 47V29L45 20Z" fill="rgba(99,102,241,0.25)" stroke={COLORS.indigoLight} strokeWidth="1.5"/>
              <path d="M37 45L43 51L54 40" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="45" cy="45" r="12" fill="none" stroke={COLORS.teal} strokeWidth="1" opacity="0.5"/>
            </svg>
          </div>
          <div style={{ position: 'absolute', top: -6, right: 16 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ animation: 'float-chip 2s ease-in-out infinite 0.3s' }}>
              <circle cx="14" cy="14" r="12" fill={COLORS.teal} opacity="0.2" stroke={COLORS.teal} strokeWidth="1"/>
              <path d="M8 14L12.5 18.5L20 11" stroke={COLORS.teal} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ position: 'absolute', bottom: -4, left: 12 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ animation: 'float-chip 2s ease-in-out infinite 0.9s' }}>
              <circle cx="11" cy="11" r="9" fill={COLORS.lavender} opacity="0.2" stroke={COLORS.lavender} strokeWidth="1"/>
              <path d="M7 11L10 14L15 9" stroke={COLORS.lavender} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 54, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 20px', ...fade(100) }}>
          <span style={{ color: COLORS.textPrimary }}>You're all set.</span><br/>
          <span style={{
            background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.indigo}, ${COLORS.lavender})`,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 3s linear infinite',
          }}>Your private AI is ready.</span>
        </h1>

        <p style={{ color: COLORS.textSecondary, fontSize: 18, lineHeight: 1.6, maxWidth: 500, margin: '0 auto 48px', ...fade(150) }}>
          Everything is running securely in your own cloud. No one else has access, not us, not anyone.
        </p>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 40, ...fade(200) }}>
          {featureCards.map((card, i) => (
            <Card key={i} style={{ textAlign: 'center', padding: 24 }} hover={false}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>{card.illustration}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>{card.title}</div>
              <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5 }}>{card.desc}</div>
            </Card>
          ))}
        </div>

        {/* Trust rows */}
        <div style={{ marginBottom: 40, textAlign: 'left', ...fade(250) }}>
          <TrustRow label="Your cloud provider" value="Microsoft Azure" />
          <TrustRow label="AI model" value="TinyLlama 1.1B" />
          <TrustRow label="Data stored on PrivateAI servers" value="None" />
          <TrustRow label="Encryption" value="End-to-end" />
        </div>

        {/* CTA */}
        <div style={{ ...fade(300) }}>
          <PrimaryButton onClick={onStartChat} size="lg" style={{ width: '100%', justifyContent: 'center', display: 'flex', padding: '18px 0', fontSize: 17 }}>
            Start chatting privately
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CompleteScreen });
