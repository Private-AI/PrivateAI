import { GlowBlob, SectionTag, SlideNum } from '../components'

export default function Slide03() {
  return (
    <div className="slide">
      <GlowBlob type="lav" style={{ width: 700, height: 700, top: -100, right: -100 }} />

      <div className="slide-content" style={{ padding: '80px 120px' }}>
        <SectionTag style={{
          background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)',
          color: '#f87171', marginBottom: 48,
        }}>The Problem</SectionTag>

        <h2 className="reveal-left delay-1" style={{
          fontFamily: 'Outfit, sans-serif', fontSize: 80, fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 56,
        }}>
          Using AI today means<br /><span style={{ color: '#f87171' }}>surrendering</span><br />your privacy.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, maxWidth: 1400 }}>
          <div className="alive-card accent-red float-delay-1" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 20, padding: 36 }}>
            <div className="alive-icon accent-red" style={{ fontSize: 44, marginBottom: 20 }}>📋</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Logged &amp; stored</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Every prompt sent to ChatGPT or Claude becomes data that can be subpoenaed, leaked, or reviewed by employees.</div>
          </div>
          <div className="alive-card accent-red float-delay-2" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 20, padding: 36 }}>
            <div className="alive-icon accent-red" style={{ fontSize: 44, marginBottom: 20 }}>🏥</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Dealbreaker for professionals</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Doctors, lawyers, journalists, engineers with trade secrets - they can't risk using public AI at all.</div>
          </div>
          <div className="alive-card accent-red float-delay-3" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 20, padding: 36 }}>
            <div className="alive-icon accent-red" style={{ fontSize: 44, marginBottom: 20 }}>📰</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>It's already happening</div>
            <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.6 }}>Samsung employees leaked trade secrets via ChatGPT. Hospitals ban staff from using AI tools. Legal firms pay millions to avoid it.</div>
          </div>
        </div>
      </div>

      <SlideNum n={3} />
    </div>
  )
}
