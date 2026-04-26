import { GlowBlob, Pill, PresenterCam, SectionTag, Sep, SlideNum } from '../components'

export default function Slide06() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 1000, height: 1000, top: -200, left: -200 }} />
      <GlowBlob type="teal"   style={{ width: 600, height: 600, bottom: -100, right: 0 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 100 }}>
        <div className="reveal-left" style={{ flex: 1 }}>
          <SectionTag style={{ marginBottom: 48 }}>The Solution</SectionTag>

          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 88, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.92, marginBottom: 44,
          }}>
            <span className="grad-text">The best of</span><br />
            <span className="grad-text">both worlds.</span>
          </h2>

          <Sep />

          <p className="reveal-left delay-2" style={{ fontSize: 28, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 700, marginBottom: 48 }}>
            <strong style={{ color: 'var(--text)' }}>PrivateAI</strong> deploys your own fully private AI server with hardware-level encryption in one click. No cloud expertise required.
          </p>

          <div className="reveal-up delay-3" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Pill variant="teal">✓ Your cloud, your data</Pill>
            <Pill variant="indigo">✓ One-click setup</Pill>
            <Pill variant="lav">✓ Hardware encryption</Pill>
            <Pill variant="teal">✓ Real-time cost control</Pill>
            <Pill variant="indigo">✓ Works in 5 minutes</Pill>
          </div>
        </div>

        <div className="reveal-right delay-2" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, width: 480 }}>
          <div className="alive-card accent-red float-delay-1" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, padding: '28px 32px' }}>
            <div style={{ fontSize: 16, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Before</div>
            <div style={{ fontSize: 20, color: 'var(--text2)' }}>Public AI → No privacy, data logged</div>
            <div style={{ fontSize: 20, color: 'var(--text2)', marginTop: 6 }}>DIY setup → Weeks of work, security risks</div>
          </div>
          <div className="alive-icon accent-teal" style={{ display: 'flex', justifyContent: 'center', fontSize: 32, color: 'var(--teal)' }}>↓</div>
          <div className="alive-card accent-indigo float-delay-2" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 16, padding: '28px 32px' }}>
            <div style={{ fontSize: 16, color: 'var(--indigo-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>After PrivateAI</div>
            <div style={{ fontSize: 20, color: 'var(--text)' }}>✓ Fully private AI on your own server</div>
            <div style={{ fontSize: 20, color: 'var(--text)', marginTop: 6 }}>✓ Running in under 5 minutes</div>
            <div style={{ fontSize: 20, color: 'var(--text)', marginTop: 6 }}>✓ No expertise needed</div>
          </div>
        </div>
      </div>

      <PresenterCam width={220} height={220} style={{ position: 'absolute', bottom: 60, right: 80 }} label="You" />
      <SlideNum n={6} />
    </div>
  )
}
