
// Screens 2-5: Provisioning Wizard

const WIZARD_STEPS = ['Cloud', 'Credentials', 'Configure', 'Deploy'];

// Step 1: Choose cloud provider
function WizardStep1({ onNext, selected, setSelected }) {
  const providers = [
    { id: 'azure', name: 'Microsoft Azure', desc: 'Trusted by enterprise worldwide', tag: 'Most popular', logo: <AzureLogo size={36}/>, available: true },
    { id: 'aws', name: 'Amazon AWS', desc: 'Vast global infrastructure', tag: 'Highly scalable', logo: <AWSLogo size={36}/>, available: true },
    { id: 'gcp', name: 'Google Cloud', desc: 'Industry-leading AI hardware', tag: 'Fast GPUs', logo: <GCPLogo size={36}/>, available: true },
    { id: 'evernode', name: 'Evernode', desc: 'Decentralised hosting network', tag: 'Coming soon', logo: <EvernodeLogo size={36}/>, available: false },
  ];
  return (
    <WizardShell step={0} title="Where should your AI live?" subtitle="Pick the cloud service you already use, or the one that sounds most familiar.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        {providers.map(p => (
          <Card key={p.id} selected={selected === p.id} onClick={p.available ? () => setSelected(p.id) : undefined}
            style={{ opacity: p.available ? 1 : 0.45, cursor: p.available ? 'pointer' : 'default', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              {p.logo}
              <Pill color={p.available ? 'indigo' : 'indigo'}>{p.tag}</Pill>
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: COLORS.textPrimary, marginBottom: 4 }}>{p.name}</div>
            <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>{p.desc}</div>
            {selected === p.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: COLORS.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4.5 7.5L8.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <span style={{ color: COLORS.indigoLight, fontSize: 12, fontWeight: 600 }}>Selected</span>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrimaryButton onClick={onNext} disabled={!selected} size="lg">Continue</PrimaryButton>
      </div>
    </WizardShell>
  );
}

// ─── Azure Device-Code Overlay ───────────────────────────────────────────────
function AzureLoginOverlay({ onSuccess, onCancel }) {
  // state: 'loading' | 'waiting' | 'creating' | 'success' | 'error'
  const [state, setState] = React.useState('loading');
  const [copied, setCopied] = React.useState(null); // 'url' | 'code'
  const [countdown, setCountdown] = React.useState(900); // 15 min
  const [pulse, setPulse] = React.useState(false);

  const DEVICE_URL = 'https://microsoft.com/devicelogin';
  const DEVICE_CODE = 'ABCD-1234';

  // Simulate flow timing
  React.useEffect(() => {
    const t1 = setTimeout(() => setState('waiting'), 900);
    return () => clearTimeout(t1);
  }, []);

  // Countdown while waiting
  React.useEffect(() => {
    if (state !== 'waiting') return;
    if (countdown <= 0) { setState('error'); return; }
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [state, countdown]);

  // Pulse animation
  React.useEffect(() => {
    if (state !== 'waiting') return;
    const t = setInterval(() => setPulse(p => !p), 1200);
    return () => clearInterval(t);
  }, [state]);

  const copyToClipboard = (text, key) => {
    try { navigator.clipboard.writeText(text); } catch(e) {}
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  // Simulate "sign in" after a click (for demo)
  const simulateSignIn = () => {
    setState('creating');
    setTimeout(() => setState('success'), 2200);
  };

  const overlayBg = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(7,9,26,0.88)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
  };

  const panel = {
    width: 480, background: '#0f1128',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12)',
    overflow: 'hidden',
  };

  const panelHeader = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: `1px solid ${COLORS.border}`,
  };

  const CopyBtn = ({ text, id, label }) => (
    <button onClick={() => copyToClipboard(text, id)} style={{
      background: copied === id ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${copied === id ? 'rgba(45,212,191,0.3)' : COLORS.border}`,
      borderRadius: 7, padding: '5px 10px', color: copied === id ? COLORS.teal : COLORS.textSecondary,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
      transition: 'all 0.2s', fontFamily: 'DM Sans, sans-serif',
    }}>
      {copied === id ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={COLORS.teal} strokeWidth="1.5" strokeLinecap="round"/></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="4" width="7" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill={copied===id?'none':'#0f1128'}/></svg>
      )}
      {copied === id ? 'Copied!' : label}
    </button>
  );

  const Spinner = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin-slow 0.9s linear infinite' }}>
      <circle cx="16" cy="16" r="13" stroke="rgba(99,102,241,0.2)" strokeWidth="3"/>
      <path d="M16 3C16 3 27 5 29 16" stroke={COLORS.indigo} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );

  return (
    <div style={overlayBg}>
      <div style={panel}>
        {/* Header */}
        <div style={panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Azure logo */}
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,120,212,0.15)', border: '1px solid rgba(0,120,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AzureLogo size={20}/>
            </div>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: COLORS.textPrimary }}>Connect to Azure</span>
          </div>
          {state !== 'loading' && state !== 'creating' && (
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '28px 24px 24px' }}>

          {/* STATE: loading */}
          {state === 'loading' && (
            <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Spinner/></div>
              <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Starting Azure login...</p>
            </div>
          )}

          {/* STATE: waiting */}
          {state === 'waiting' && (
            <div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Sign in to Azure</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
                Go to the URL below and enter the code to authenticate. This opens in a separate browser tab — come back here when done.
              </p>

              {/* URL row */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Login URL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, fontFamily: 'monospace' }}>{DEVICE_URL}</span>
                  <CopyBtn text={DEVICE_URL} id="url" label="Copy"/>
                  <a href="#" onClick={e => e.preventDefault()} style={{
                    background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.border}`, borderRadius: 7,
                    padding: '5px 10px', color: COLORS.textSecondary, fontSize: 12, fontWeight: 600,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4.5 2H2C1.45 2 1 2.45 1 3V9C1 9.55 1.45 10 2 10H8C8.55 10 9 9.55 9 9V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M6.5 1H10M10 1V4.5M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    Open
                  </a>
                </div>
              </div>

              {/* Code */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Your one-time code</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(99,102,241,0.08)', border: `1px solid rgba(99,102,241,0.25)`, borderRadius: 12, padding: '16px 20px' }}>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 36, fontWeight: 700, letterSpacing: '0.18em', color: COLORS.textPrimary }}>{DEVICE_CODE}</span>
                  <CopyBtn text={DEVICE_CODE} id="code" label="Copy code"/>
                </div>
              </div>

              {/* Timer + status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.teal, boxShadow: `0 0 8px ${COLORS.teal}`, opacity: pulse ? 1 : 0.3, transition: 'opacity 0.6s' }}/>
                  <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>Waiting for you to sign in...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke={COLORS.textMuted} strokeWidth="1.2"/><path d="M6.5 3.5V7L8.5 8.5" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/></svg>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: countdown < 120 ? '#f87171' : COLORS.textMuted }}>{fmt(countdown)}</span>
                </div>
              </div>

              {/* Demo shortcut */}
              <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(45,212,191,0.06)', border: `1px solid rgba(45,212,191,0.15)`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={COLORS.teal} strokeWidth="1.2"/><path d="M7 4V7.5L9 9" stroke={COLORS.teal} strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span style={{ fontSize: 12, color: COLORS.textMuted, flex: 1 }}>Prototype demo:</span>
                <button onClick={simulateSignIn} style={{ background: COLORS.teal, border: 'none', borderRadius: 6, padding: '4px 12px', color: '#0f1128', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  Simulate sign-in
                </button>
              </div>

              <button onClick={onCancel} style={{ width: '100%', background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '11px', color: COLORS.textSecondary, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                Cancel
              </button>
            </div>
          )}

          {/* STATE: creating */}
          {state === 'creating' && (
            <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Spinner/></div>
              <p style={{ color: COLORS.textSecondary, fontSize: 15 }}>Creating service principal...</p>
              <p style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 6 }}>Setting up secure access to your subscription</p>
            </div>
          )}

          {/* STATE: success */}
          {state === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 20px' }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ animation: 'tick-in 0.4s ease' }}>
                  <path d="M5 13L10.5 18.5L21 8" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Connected successfully</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: '0 0 24px' }}>Your Azure account is linked. Credentials have been set up automatically.</p>

              <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                {[
                  { label: 'Account', value: 'alex.morgan@company.com' },
                  { label: 'Subscription', value: 'Company Production (a1b2c3d4...)' },
                  { label: 'Tenant ID', value: 'e5f6a7b8-...' },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                    <span style={{ color: COLORS.textMuted, fontSize: 13 }}>{row.label}</span>
                    <span style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: row.label !== 'Account' ? 'monospace' : 'inherit' }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <PrimaryButton onClick={() => onSuccess()} size="lg" style={{ width: '100%', justifyContent: 'center', display: 'flex', fontSize: 15 }}>
                Done — continue setup
              </PrimaryButton>
            </div>
          )}

          {/* STATE: error */}
          {state === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 20px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8V12M12 16H12.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="12" r="9" stroke="#f87171" strokeWidth="1.5"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 8px' }}>Authentication timed out</h3>
              <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>The code expired before you signed in. This happens if the browser tab wasn't completed in time.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setState('loading'); setCountdown(900); setTimeout(() => setState('waiting'), 900); }}
                  style={{ flex: 1, background: COLORS.indigo, border: 'none', borderRadius: 10, padding: '12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  Try again
                </button>
                <button onClick={onCancel} style={{ flex: 1, background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px', color: COLORS.textSecondary, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
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

// Step 2: Credentials
function WizardStep2({ onNext, onBack }) {
  const fields = [
    { id: 'sub',    label: 'Subscription ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Where to find it', hintDetail: 'Sign in to portal.azure.com, click "Subscriptions" in the left menu, and copy the ID from the list.' },
    { id: 'tenant', label: 'Tenant ID',        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Where to find it', hintDetail: 'In Azure Portal, go to Azure Active Directory, then Properties. Copy the Tenant ID.' },
    { id: 'app',    label: 'App (Client) ID',  placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Where to find it', hintDetail: 'In Azure Portal, go to App registrations, find your app, and copy the Application (client) ID.' },
    { id: 'secret', label: 'Client Secret',    placeholder: 'Your client secret value', hint: 'Where to find it', hintDetail: 'In your App registration, go to Certificates & secrets. Create a new secret and copy its Value immediately.', secret: true },
  ];

  const AUTOFILL = {
    sub:    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    tenant: 'e5f6a7b8-c9d0-1234-5678-90abcdef1234',
    app:    'f1e2d3c4-b5a6-9870-fedc-ba0987654321',
    secret: 'Az.8Kx~mNpQ2rTvWy4sUjL6hDfGbCeA3iO',
  };

  const [values, setValues]           = React.useState({});
  const [showHint, setShowHint]       = React.useState(null);
  const [showOverlay, setShowOverlay] = React.useState(false);
  const [showManual, setShowManual]   = React.useState(false);
  const [connectedVia, setConnectedVia] = React.useState(false); // true after OAuth success

  const manualDone = fields.filter(f => (values[f.id]?.length || 0) > 8);
  const canContinue = connectedVia || manualDone.length === fields.length;

  const handleOAuthSuccess = () => {
    setShowOverlay(false);
    setValues(AUTOFILL);
    setConnectedVia(true);
    setShowManual(true);
  };

  return (
    <WizardShell step={1} title="Connect your Azure account" subtitle="The fastest way is one click. Or fill in your credentials manually if you prefer full control.">

      {/* OAuth overlay */}
      {showOverlay && <AzureLoginOverlay onSuccess={handleOAuthSuccess} onCancel={() => setShowOverlay(false)}/>}

      {/* ── Connect to Azure button ── */}
      {!connectedVia ? (
        <div style={{ marginBottom: 6 }}>
          <button onClick={() => setShowOverlay(true)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            background: 'linear-gradient(135deg, rgba(0,120,212,0.18) 0%, rgba(99,102,241,0.15) 100%)',
            border: '1px solid rgba(0,120,212,0.35)', borderRadius: 14,
            padding: '15px 24px', cursor: 'pointer', transition: 'all 0.2s',
            fontFamily: 'DM Sans, sans-serif',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,120,212,0.6)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,120,212,0.26) 0%, rgba(99,102,241,0.2) 100%)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,120,212,0.35)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,120,212,0.18) 0%, rgba(99,102,241,0.15) 100%)'; }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,120,212,0.2)', border: '1px solid rgba(0,120,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AzureLogo size={20}/>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#eef0ff', fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Connect to Azure</div>
              <div style={{ color: '#8b92b8', fontSize: 12, marginTop: 2 }}>Sign in with your Microsoft account — no copy-pasting required</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}><path d="M6 4L10 8L6 12" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          {/* Manual toggle */}
          <div style={{ textAlign: 'center', marginTop: 14, marginBottom: 10 }}>
            <button onClick={() => setShowManual(v => !v)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {showManual ? 'Hide manual form' : 'Enter credentials manually instead'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Connected badge ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>Connected via Azure</div>
            <div style={{ color: COLORS.textMuted, fontSize: 12 }}>Signed in as alex.morgan@company.com</div>
          </div>
          <button onClick={() => { setConnectedVia(false); setValues({}); setShowManual(false); }}
            style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: '4px 10px', color: COLORS.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            Disconnect
          </button>
        </div>
      )}

      {/* Divider */}
      {showManual && !connectedVia && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: COLORS.border }}/>
          <span style={{ color: COLORS.textMuted, fontSize: 12 }}>or fill in manually</span>
          <div style={{ flex: 1, height: 1, background: COLORS.border }}/>
        </div>
      )}

      {/* ── Manual form ── */}
      {showManual && (
        <div style={{ opacity: connectedVia ? 0.7 : 1, pointerEvents: connectedVia ? 'none' : 'auto' }}>
          {fields.map(f => {
            const isDone = (values[f.id]?.length || 0) > 8;
            return (
              <div key={f.id} style={{ marginBottom: 10 }}>
                {isDone ? (
                  /* Completed row */
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: connectedVia ? 'rgba(34,197,94,0.05)' : 'rgba(45,212,191,0.06)', border: `1px solid ${connectedVia ? 'rgba(34,197,94,0.2)' : 'rgba(45,212,191,0.2)'}`, borderRadius: 10 }}>
                    <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>{f.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: 'monospace' }}>{f.secret ? '••••••••••••' : values[f.id].slice(0,10) + '••••'}</span>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: connectedVia ? 'rgba(34,197,94,0.2)' : 'rgba(45,212,191,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8.5 3" stroke={connectedVia ? '#4ade80' : COLORS.teal} strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Input card */
                  <Card style={{ padding: 18 }}>
                    <label style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>{f.label}</label>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      placeholder={f.placeholder}
                      value={values[f.id] || ''}
                      onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', color: COLORS.textPrimary, fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                      onFocus={e => e.target.style.borderColor = COLORS.indigo}
                      onBlur={e => e.target.style.borderColor = COLORS.border}
                    />
                    <button onClick={() => setShowHint(showHint === f.id ? null : f.id)}
                      style={{ background: 'none', border: 'none', color: COLORS.teal, fontSize: 12, cursor: 'pointer', marginTop: 8, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={COLORS.teal} strokeWidth="1.2"/><text x="7" y="11" textAnchor="middle" fill={COLORS.teal} fontSize="9" fontWeight="700">?</text></svg>
                      {f.hint}
                    </button>
                    {showHint === f.id && (
                      <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(45,212,191,0.06)', borderRadius: 8, color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                        {f.hintDetail}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Security note */}
      <div style={{ marginTop: showManual ? 8 : 0, padding: '10px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L4 5V9C4 12.3 5.9 14.8 8 15.5C10.1 14.8 12 12.3 12 9V5L8 2Z" stroke={COLORS.indigo} strokeWidth="1.2"/></svg>
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>Your credentials are encrypted and sent directly to your cloud. We never see them.</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onNext} disabled={!canContinue} size="lg">Continue</PrimaryButton>
      </div>
    </WizardShell>
  );
}

// Step 3: Configure — model selection with countdown
function WizardStep3({ onNext, onBack }) {
  const models = [
    { id: 'tinyllama', name: 'TinyLlama 1.1B', tag: 'Recommended', desc: 'Fast, lightweight, and perfect for everyday conversations. Great for most people.', speed: 95, quality: 62 },
    { id: 'mistral', name: 'Mistral 7B', tag: 'Balanced', desc: 'A great middle ground. Smarter responses, still snappy. Good for complex questions.', speed: 72, quality: 82 },
    { id: 'llama3', name: 'Llama 3 8B', tag: 'Most capable', desc: 'The most powerful option. Best for detailed writing, research, and deep thinking.', speed: 55, quality: 95 },
  ];
  const [selected, setSelected] = React.useState('tinyllama');
  const [countdown, setCountdown] = React.useState(5);
  const [autoAdvanced, setAutoAdvanced] = React.useState(false);
  const [userPicked, setUserPicked] = React.useState(false);

  React.useEffect(() => {
    if (userPicked) return;
    if (countdown <= 0) { setAutoAdvanced(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, userPicked]);

  const handleSelect = (id) => { setSelected(id); setUserPicked(true); };

  return (
    <WizardShell step={2} title="Choose your AI model" subtitle="Not sure? The default is perfect for most people. You can change this any time.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {models.map(m => (
          <Card key={m.id} selected={selected === m.id} onClick={() => handleSelect(m.id)} style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: COLORS.textPrimary }}>{m.name}</span>
                  <Pill color={m.id === 'tinyllama' ? 'teal' : m.id === 'mistral' ? 'indigo' : 'lavender'}>{m.tag}</Pill>
                  {m.id === 'tinyllama' && !userPicked && countdown > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${COLORS.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" style={{ position: 'absolute', top: -2, left: -2, transform: 'rotate(-90deg)' }}>
                          <circle cx="12" cy="12" r="10" fill="none" stroke={COLORS.teal} strokeWidth="2"
                            strokeDasharray={`${(countdown / 5) * 62.8} 62.8`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }}/>
                        </svg>
                        <span style={{ fontSize: 10, color: COLORS.teal, fontWeight: 700 }}>{countdown}</span>
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>auto-selecting</span>
                    </div>
                  )}
                </div>
                <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>{m.desc}</p>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Speed</div>
                    <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <div style={{ width: `${m.speed}%`, height: '100%', background: COLORS.teal, borderRadius: 2, transition: 'width 0.5s ease' }}/>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Smarts</div>
                    <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <div style={{ width: `${m.quality}%`, height: '100%', background: COLORS.lavender, borderRadius: 2, transition: 'width 0.5s ease' }}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onNext} size="lg">
          {autoAdvanced && !userPicked ? 'Continue with TinyLlama' : 'Continue'}
        </PrimaryButton>
      </div>
    </WizardShell>
  );
}

// Step 4: Deploying
function WizardStep4({ onComplete }) {
  const deploySteps = [
    'Creating your private server',
    'Installing the AI model',
    'Setting up encryption',
    'Configuring your network',
    'Running security checks',
    'Testing your connection',
    'Finalising your workspace',
    'Almost there...',
  ];
  const tips = [
    'Your conversations are encrypted end-to-end. Even we can\'t read them.',
    'Your AI runs entirely in your own cloud account. Zero data touches our servers.',
    'You can delete everything from your cloud at any time. You\'re always in control.',
    'Open source models mean no hidden training on your data, ever.',
    'Your private AI works even if PrivateAI shuts down. You own the infrastructure.',
  ];
  const messages = [
    'Brewing something special for you...',
    'Good things take a moment. This one\'s worth it.',
    'Setting up your personal AI corner of the internet.',
    'Almost there! Your private AI is taking shape.',
  ];

  const [completedSteps, setCompletedSteps] = React.useState(0);
  const [tipIdx, setTipIdx] = React.useState(0);
  const [msgIdx, setMsgIdx] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [showConfetti, setShowConfetti] = React.useState(false);

  React.useEffect(() => {
    if (completedSteps >= deploySteps.length) {
      setTimeout(() => { setShowConfetti(true); setTimeout(onComplete, 2200); }, 600);
      return;
    }
    const delay = completedSteps === 0 ? 800 : 1200 + Math.random() * 800;
    const t = setTimeout(() => setCompletedSteps(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [completedSteps]);

  React.useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 5000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 4000);
    return () => clearInterval(t);
  }, []);

  const progress = (completedSteps / deploySteps.length) * 100;

  return (
    <WizardShell step={3} title="" subtitle="">
      {showConfetti && <Confetti />}
      <div style={{ textAlign: 'center', padding: '10px 0 30px' }}>
        {/* Animated central graphic */}
        <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto 32px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid rgba(99,102,241,0.2)`, animation: 'pulse-ring 3s ease-in-out infinite' }}/>
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: `2px solid rgba(45,212,191,0.15)`, animation: 'pulse-ring 3s ease-in-out infinite 1s' }}/>
          {/* Spinning ring */}
          <svg style={{ position: 'absolute', inset: 0, animation: 'spin-slow 8s linear infinite' }} width="180" height="180" viewBox="0 0 180 180" fill="none">
            <circle cx="90" cy="90" r="80" stroke="url(#spinGrad)" strokeWidth="2" strokeDasharray="80 420" strokeLinecap="round"/>
            <defs>
              <linearGradient id="spinGrad" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor={COLORS.indigo}/>
                <stop offset="1" stopColor={COLORS.teal} stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ animation: 'deploy-glow 2s ease-in-out infinite' }}>
              <ShieldIllustration size={90} />
            </div>
          </div>
        </div>

        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 8px', letterSpacing: '-0.02em', minHeight: 36, transition: 'opacity 0.5s' }}>
          {messages[msgIdx]}
        </h2>
        <p style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 32 }}>This usually takes 3-5 minutes. Grab a coffee!</p>

        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 100, height: 6, marginBottom: 32, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.teal})`, borderRadius: 100, transition: 'width 0.8s ease' }}/>
        </div>

        {/* Deploy steps list */}
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          {deploySteps.map((step, i) => {
            const isDone = i < completedSteps;
            const isActive = i === completedSteps;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isDone || isActive ? 1 : 0.3, transition: 'opacity 0.5s' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: isDone ? COLORS.indigo : isActive ? 'transparent' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${isDone ? COLORS.indigo : isActive ? COLORS.indigo : 'rgba(255,255,255,0.1)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isActive ? `0 0 12px ${COLORS.indigo}60` : 'none',
                  transition: 'all 0.4s ease',
                }}>
                  {isDone ? (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ animation: 'tick-in 0.3s ease' }}>
                      <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ) : isActive ? (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.indigo, animation: 'pulse-core 1.5s infinite' }}/>
                  ) : null}
                </div>
                <span style={{ fontSize: 14, color: isDone ? COLORS.textSecondary : isActive ? COLORS.textPrimary : COLORS.textMuted, fontWeight: isActive ? 600 : 400 }}>{step}</span>
              </div>
            );
          })}
        </div>

        {/* Rotating tip */}
        <div style={{ padding: '14px 18px', background: 'rgba(99,102,241,0.07)', border: `1px solid rgba(99,102,241,0.15)`, borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.indigo, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Did you know</div>
          <div key={tipIdx} style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, animation: 'shimmer 0.3s ease' }}>{tips[tipIdx]}</div>
        </div>
      </div>
    </WizardShell>
  );
}

// Wrapper layout for all wizard screens
function WizardShell({ step, title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', flexDirection: 'column' }}>
      <nav style={{ display: 'flex', alignItems: 'center', padding: '24px 64px' }}>
        <Logo />
      </nav>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px 60px' }}>
        <div style={{ width: '100%', maxWidth: 600 }}>
          <StepProgress steps={WIZARD_STEPS} currentStep={step} />
          {title && <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 10px', letterSpacing: '-0.02em' }}>{title}</h2>}
          {subtitle && <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: '0 0 28px', lineHeight: 1.6 }}>{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// Confetti burst
function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 0.8,
    color: [COLORS.indigo, COLORS.teal, COLORS.lavender, '#f59e0b', '#ec4899'][Math.floor(Math.random() * 5)],
    size: 6 + Math.random() * 8, duration: 2 + Math.random() * 1.5,
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: -20, left: `${p.x}%`,
          width: p.size, height: p.size, background: p.color, borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          opacity: 0,
        }}/>
      ))}
    </div>
  );
}

Object.assign(window, { WizardStep1, WizardStep2, WizardStep3, WizardStep4, WizardShell, Confetti, WIZARD_STEPS });
