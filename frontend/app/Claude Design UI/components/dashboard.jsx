
// Screen: Dashboard — Multi-VM setup

function DashboardScreen({ onChat }) {
  const [moreExpanded, setMoreExpanded] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [hoveredVm, setHoveredVm] = React.useState(null);
  const [activeVm, setActiveVm] = React.useState('primary');

  const primaryVm = {
    id: 'primary',
    name: 'PrivateAI Primary',
    region: 'UK South',
    provider: 'azure',
    model: 'TinyLlama 1.1B',
    status: 'running',
    cpu: 18,
    ram: 62,
    uptime: '14d 6h',
    ip: '10.0.1.4',
    size: 'Standard B2s',
    cost: '~£12/mo',
  };

  const otherVms = [
    { id: 'dev', name: 'Dev Sandbox', region: 'West Europe', provider: 'azure', model: 'Mistral 7B', status: 'running', cpu: 44, ram: 78, uptime: '3d 2h', ip: '10.0.2.4', size: 'Standard B4s', cost: '~£24/mo' },
    { id: 'research', name: 'Research Node', region: 'East US', provider: 'aws', model: 'Llama 3 8B', status: 'stopped', cpu: 0, ram: 0, uptime: 'Offline', ip: '10.1.0.5', size: 't3.xlarge', cost: '~£28/mo' },
    { id: 'backup', name: 'Backup Instance', region: 'North Europe', provider: 'azure', model: 'TinyLlama 1.1B', status: 'idle', cpu: 2, ram: 31, uptime: '7d 11h', ip: '10.0.3.8', size: 'Standard B2s', cost: '~£12/mo' },
  ];

  const handleConnect = () => {
    if (connected) return;
    setConnecting(true);
    setTimeout(() => { setConnecting(false); setConnected(true); }, 1800);
  };

  const statusColor = (s) => s === 'running' ? '#4ade80' : s === 'idle' ? '#facc15' : '#6b7280';
  const statusLabel = (s) => s === 'running' ? 'Running' : s === 'idle' ? 'Idle' : 'Stopped';

  const ProviderBadge = ({ p }) => p === 'azure' ? <AzureLogo size={16}/> : p === 'aws' ? <AWSLogo size={16}/> : <GCPLogo size={16}/>;

  const UsageBar = ({ val, color }) => (
    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
      <div style={{ width: `${val}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }}/>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes conn-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes expand-down { from{max-height:0;opacity:0} to{max-height:600px;opacity:1} }
      `}</style>

      {/* Top nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 40px', borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Logo />
          {/* Nav tabs */}
          {['Dashboard', 'VMs', 'Settings'].map((tab, i) => (
            <button key={tab} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px',
              color: i === 0 ? COLORS.textPrimary : COLORS.textMuted,
              fontSize: 14, fontWeight: i === 0 ? 600 : 400, fontFamily: 'DM Sans, sans-serif',
              borderBottom: `2px solid ${i === 0 ? COLORS.indigo : 'transparent'}`,
              transition: 'color 0.2s',
            }}>{tab}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 100 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }}/>
            <span style={{ fontSize: 12, color: COLORS.teal, fontWeight: 600 }}>2 VMs online</span>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.indigoLight }}>AM</span>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div style={{ flex: 1, padding: '36px 40px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Your Private AI</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 14 }}>Manage your VMs and start private conversations</p>
        </div>

        {/* ── FEATURED VM ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24, animation: 'fade-in-up 0.5s ease both' }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Active instance</div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(45,212,191,0.06) 100%)',
            border: `1px solid rgba(99,102,241,0.3)`,
            borderRadius: 20,
            padding: '28px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Glow accent */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', pointerEvents: 'none' }}/>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}>
              {/* VM icon + status */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ position: 'relative', width: 72, height: 72 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(99,102,241,0.15)', border: `1px solid rgba(99,102,241,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <rect x="4" y="8" width="28" height="18" rx="4" stroke={COLORS.indigoLight} strokeWidth="1.5"/>
                      <rect x="8" y="12" width="20" height="10" rx="2" fill={COLORS.indigo} opacity="0.4"/>
                      <line x1="12" y1="26" x2="24" y2="26" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="18" y1="26" x2="18" y2="30" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="12" y1="30" x2="24" y2="30" stroke={COLORS.indigoLight} strokeWidth="1.5" strokeLinecap="round"/>
                      {/* blinking cursor inside screen */}
                      <rect x="10" y="14" width="2" height="6" rx="1" fill={COLORS.teal} opacity="0.9"/>
                      <line x1="14" y1="15" x2="22" y2="15" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round"/>
                      <line x1="14" y1="18" x2="20" y2="18" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </div>
                  {/* Status dot */}
                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#4ade80', border: '2px solid #07091a', boxShadow: '0 0 8px #4ade80' }}/>
                </div>
              </div>

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>{primaryVm.name}</h2>
                  <Pill color="green">Running</Pill>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.6 }}>
                    <ProviderBadge p={primaryVm.provider}/>
                    <span style={{ fontSize: 12, color: COLORS.textMuted }}>{primaryVm.region}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
                  {[
                    { label: 'Model', value: primaryVm.model },
                    { label: 'Size', value: primaryVm.size },
                    { label: 'Uptime', value: primaryVm.uptime },
                    { label: 'IP', value: primaryVm.ip },
                    { label: 'Cost', value: primaryVm.cost },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: label === 'IP' ? 'monospace' : 'inherit', fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Resource bars */}
                <div style={{ display: 'flex', gap: 28 }}>
                  {[
                    { label: 'CPU', val: primaryVm.cpu, color: COLORS.indigo },
                    { label: 'RAM', val: primaryVm.ram, color: COLORS.teal },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ minWidth: 120 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
                        <span style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: 'monospace' }}>{val}%</span>
                      </div>
                      <UsageBar val={val} color={color}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {/* Connect */}
                <button onClick={handleConnect} disabled={connecting || connected}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : COLORS.border}`,
                    borderRadius: 10, padding: '10px 18px', cursor: connecting || connected ? 'default' : 'pointer',
                    color: connected ? '#4ade80' : COLORS.textSecondary, fontSize: 13, fontWeight: 600,
                    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.25s', whiteSpace: 'nowrap',
                    minWidth: 130,
                  }}
                  onMouseEnter={e => { if (!connecting && !connected) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}}
                  onMouseLeave={e => { if (!connecting && !connected) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}}
                >
                  {connecting ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'conn-pulse 1s infinite' }}>
                        <circle cx="7" cy="7" r="6" stroke={COLORS.indigo} strokeWidth="1.5" strokeDasharray="4 2"/>
                      </svg>
                      Connecting...
                    </>
                  ) : connected ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      Connected
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="4" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                        <circle cx="10" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                        <line x1="6.5" y1="7" x2="7.5" y2="7" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                      Connect
                    </>
                  )}
                </button>

                {/* Chat */}
                <PrimaryButton onClick={onChat} size="md"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', minWidth: 130 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 3C2 2.45 2.45 2 3 2H11C11.55 2 12 2.45 12 3V9C12 9.55 11.55 10 11 10H8L5 13V10H3C2.45 10 2 9.55 2 9V3Z" stroke="white" strokeWidth="1.3"/>
                  </svg>
                  Chat now
                </PrimaryButton>

                {/* Menu */}
                <button style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = COLORS.textSecondary; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = COLORS.textMuted; }}>
                  <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
                    <circle cx="2" cy="2" r="1.5" fill="currentColor"/>
                    <circle cx="8" cy="2" r="1.5" fill="currentColor"/>
                    <circle cx="14" cy="2" r="1.5" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── MORE VMs COLLAPSIBLE ─────────────────────────────────── */}
        <div style={{ animation: 'fade-in-up 0.5s ease 0.1s both' }}>
          {/* Toggle header */}
          <button onClick={() => setMoreExpanded(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: moreExpanded ? COLORS.bgCard : 'rgba(255,255,255,0.02)',
            border: `1px solid ${moreExpanded ? COLORS.borderHover : COLORS.border}`,
            borderRadius: moreExpanded ? '14px 14px 0 0' : 14,
            padding: '14px 20px', cursor: 'pointer', transition: 'all 0.25s',
            fontFamily: 'DM Sans, sans-serif',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="4" rx="1.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
                <rect x="1" y="8" width="14" height="4" rx="1.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
                <circle cx="4" cy="4" r="1" fill={COLORS.textMuted} opacity="0.5"/>
                <circle cx="4" cy="10" r="1" fill={COLORS.textMuted} opacity="0.5"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary }}>More VMs</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {otherVms.map(vm => (
                  <div key={vm.id} style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(vm.status), opacity: 0.8 }}/>
                ))}
              </div>
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>{otherVms.length} instances</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>{moreExpanded ? 'Collapse' : 'Expand'}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                style={{ transform: moreExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
                <path d="M4 6L8 10L12 6" stroke={COLORS.textMuted} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </button>

          {/* Expanded list */}
          {moreExpanded && (
            <div style={{
              border: `1px solid ${COLORS.borderHover}`, borderTop: 'none',
              borderRadius: '0 0 14px 14px', overflow: 'hidden',
              animation: 'expand-down 0.3s ease both',
            }}>
              {otherVms.map((vm, i) => (
                <div key={vm.id}
                  onMouseEnter={() => setHoveredVm(vm.id)}
                  onMouseLeave={() => setHoveredVm(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 18,
                    padding: '16px 20px',
                    background: hoveredVm === vm.id ? 'rgba(255,255,255,0.035)' : i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none',
                    transition: 'background 0.15s',
                  }}>
                  {/* Status dot + icon */}
                  <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="2" y="4" width="16" height="10" rx="2.5" stroke={COLORS.textMuted} strokeWidth="1.2"/>
                        <line x1="7" y1="14" x2="13" y2="14" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
                        <line x1="10" y1="14" x2="10" y2="17" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
                        <line x1="7" y1="17" x2="13" y2="17" stroke={COLORS.textMuted} strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: statusColor(vm.status), border: '2px solid #07091a' }}/>
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{vm.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.6 }}>
                        <ProviderBadge p={vm.provider}/>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{vm.region}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>{vm.model}</span>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>{vm.size}</span>
                      <span style={{ fontSize: 12, color: statusColor(vm.status), fontWeight: 500 }}>{statusLabel(vm.status)} · {vm.uptime}</span>
                    </div>
                  </div>

                  {/* Usage bars (only if active) */}
                  {vm.status !== 'stopped' && (
                    <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                      {[{ label: 'CPU', val: vm.cpu, color: COLORS.indigo }, { label: 'RAM', val: vm.ram, color: COLORS.teal }].map(({ label, val, color }) => (
                        <div key={label} style={{ width: 72 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{label}</span>
                            <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace' }}>{val}%</span>
                          </div>
                          <UsageBar val={val} color={color}/>
                        </div>
                      ))}
                    </div>
                  )}
                  {vm.status === 'stopped' && (
                    <div style={{ fontSize: 12, color: COLORS.textMuted, opacity: 0.5, flexShrink: 0, width: 160, textAlign: 'center' }}>—</div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, opacity: hoveredVm === vm.id ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                    {vm.status !== 'stopped' ? (
                      <>
                        <button onClick={() => { setActiveVm(vm.id); onChat(); }}
                          style={{ background: COLORS.indigo, border: 'none', borderRadius: 8, padding: '7px 14px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 2.5C1.5 2.2 1.7 2 2 2H9C9.3 2 9.5 2.2 9.5 2.5V7.5C9.5 7.8 9.3 8 9 8H7L5.5 10V8H2C1.7 8 1.5 7.8 1.5 7.5V2.5Z" stroke="white" strokeWidth="1.1"/></svg>
                          Chat
                        </button>
                        <button style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 12px', color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                          Connect
                        </button>
                      </>
                    ) : (
                      <button style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 14px', color: COLORS.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="3,2 9,5 3,8" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                        Start
                      </button>
                    )}
                    <button style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 8px', color: COLORS.textMuted, fontSize: 12, cursor: 'pointer' }}>
                      <svg width="14" height="4" viewBox="0 0 14 4" fill="none">
                        <circle cx="2" cy="2" r="1.3" fill="currentColor"/>
                        <circle cx="7" cy="2" r="1.3" fill="currentColor"/>
                        <circle cx="12" cy="2" r="1.3" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                  {otherVms.filter(v => v.status !== 'stopped').length} of {otherVms.length} running
                </span>
                <button style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '6px 14px', color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 2V9M2 5.5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Add VM
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

Object.assign(window, { DashboardScreen });
