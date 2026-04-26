import { GlowBlob, PresenterCam, SectionTag, SlideNum } from '../components'

export default function Slide12() {
  return (
    <div className="slide">
      <GlowBlob type="lav" style={{ width: 900, height: 900, top: -300, right: -200 }} />

      <div className="slide-content" style={{ padding: '80px 120px' }}>
        <SectionTag style={{ marginBottom: 48 }}>Impact</SectionTag>
        <h2 className="reveal-left delay-1" style={{
          fontFamily: 'Outfit, sans-serif', fontSize: 80, fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 64,
        }}>
          Who gets to use<br />AI <span className="grad-text">safely finally.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, maxWidth: 1500 }}>
          <div className="alive-card accent-indigo float-delay-1" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, padding: 32 }}>
            <div className="alive-icon accent-indigo" style={{ fontSize: 52, marginBottom: 20 }}>⚖️</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: '#818cf8', marginBottom: 14 }}>Legal</div>
            <div style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.6 }}>Analyse privileged client documents without risking confidentiality. AI-powered case research with zero data exposure.</div>
          </div>
          <div className="alive-card accent-teal float-delay-2" style={{ background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: 20, padding: 32 }}>
            <div className="alive-icon accent-teal" style={{ fontSize: 52, marginBottom: 20 }}>🏥</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: '#2dd4bf', marginBottom: 14 }}>Healthcare</div>
            <div style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.6 }}>AI diagnostics and patient record analysis without GDPR violations. No patient data leaves the hospital's cloud.</div>
          </div>
          <div className="alive-card accent-lav float-delay-3" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 20, padding: 32 }}>
            <div className="alive-icon accent-lav" style={{ fontSize: 52, marginBottom: 20 }}>📰</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: '#a78bfa', marginBottom: 14 }}>Journalism</div>
            <div style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.6 }}>Query sensitive sources and draft investigative pieces without leaving trails on third-party servers.</div>
          </div>
          <div className="alive-card accent-teal" style={{ background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 20, padding: 32 }}>
            <div className="alive-icon accent-teal" style={{ fontSize: 52, marginBottom: 20 }}>💻</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: '#2dd4bf', marginBottom: 14 }}>Engineering</div>
            <div style={{ fontSize: 17, color: 'var(--text2)', lineHeight: 1.6 }}>Code review, architecture planning, and debugging with proprietary codebases. Trade secrets stay internal.</div>
          </div>
        </div>
      </div>

      <PresenterCam width={220} height={220} style={{ position: 'absolute', bottom: 60, right: 80 }} label="You" />
      <SlideNum n={12} />
    </div>
  )
}
