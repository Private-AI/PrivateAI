import { GlowBlob, PresenterCam, SectionTag, SlideNum } from '../components'

export default function Slide07() {
  return (
    <div className="slide">
      <GlowBlob type="teal" style={{ width: 800, height: 800, top: -200, right: -100 }} />

      <div className="slide-content" style={{ padding: '80px 120px' }}>
        <SectionTag style={{ marginBottom: 48 }}>How It Works</SectionTag>
        <h2 className="reveal-left delay-1" style={{
          fontFamily: 'Outfit, sans-serif', fontSize: 64, fontWeight: 800,
          letterSpacing: '-0.03em', marginBottom: 64,
        }}>
          Zero to private AI in <span className="grad-text-warm">5 minutes.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 32 }}>
          <div className="alive-card accent-indigo float-delay-1" style={{ borderRadius: 20, padding: 24, background: 'rgba(255,255,255,0.025)' }}>
            <div className="alive-icon accent-indigo" style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="4" y="6" width="20" height="16" rx="4" stroke="#818cf8" strokeWidth="1.8" />
                <path d="M10 6V4C10 2.9 10.9 2 12 2H16C17.1 2 18 2.9 18 4V6" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>01</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Choose your cloud</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Azure, AWS, or Google Cloud. Pick your GPU profile, from budget to NVIDIA H100 with AMD SEV-SNP confidential computing.</div>
          </div>

          <div className="alive-card accent-teal float-delay-2" style={{ borderRadius: 20, padding: 24, background: 'rgba(255,255,255,0.025)' }}>
            <div className="alive-icon accent-teal" style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="10" cy="14" r="5" stroke="#2dd4bf" strokeWidth="1.8" />
                <circle cx="18" cy="14" r="5" stroke="#2dd4bf" strokeWidth="1.8" />
                <line x1="15" y1="14" x2="13" y2="14" stroke="#2dd4bf" strokeWidth="1.8" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>02</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Connect in one click</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Enter credentials or sign in via OAuth. We handle provisioning, firewall, GPU drivers, model install - everything.</div>
          </div>

          <div className="alive-card accent-lav float-delay-3" style={{ borderRadius: 20, padding: 24, background: 'rgba(255,255,255,0.025)' }}>
            <div className="alive-icon accent-lav" style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 4L6 8V14C6 19.5 9.6 24.2 14 25.5C18.4 24.2 22 19.5 22 14V8L14 4Z" stroke="#a78bfa" strokeWidth="1.8" />
                <path d="M10 14L13 17L18 12" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>03</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Your VM is live</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Real-time progress via WebSocket. Watch 13 setup steps complete. Dashboard shows running status, CPU, RAM, budget.</div>
          </div>

          <div className="alive-card accent-teal" style={{ borderRadius: 20, padding: 24, background: 'rgba(255,255,255,0.025)' }}>
            <div className="alive-icon accent-teal" style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M4 8C4 6.9 4.9 6 6 6H22C23.1 6 24 6.9 24 8V18C24 19.1 23.1 20 22 20H16L12 24V20H6C4.9 20 4 19.1 4 18V8Z" stroke="#2dd4bf" strokeWidth="1.8" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>04</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Connect &amp; Chat</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Open WebUI launches directly in the app, talking to your server. Your prompts never touch our infrastructure.</div>
          </div>
        </div>
      </div>

      <PresenterCam
        width={180}
        height={180}
        style={{ position: 'absolute', top: 72, right: 96 }}
        videoSrc="/videos/Slide7.mp4"
        videoStyle={{ objectFit: 'contain', objectPosition: 'center' }}
        muted={false}
        loop={false}
        logoPattern
        onEnded={() => window.dispatchEvent(new Event('privateai-media-ended'))}
      />

      <SlideNum n={7} />
    </div>
  )
}
