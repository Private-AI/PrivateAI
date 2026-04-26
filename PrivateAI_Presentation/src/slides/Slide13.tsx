import { GlowBlob, PresenterCam, SectionTag, Sep, SlideNum } from '../components'

export default function Slide13() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 900, height: 900, top: -300, left: -100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 140px', gap: 120 }}>
        <div className="reveal-left" style={{ flex: 1 }}>
          <SectionTag style={{ marginBottom: 48 }}>The Team</SectionTag>
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 80, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 40,
          }}>
            Built by people<br />who care about<br /><span className="grad-text">your privacy.</span>
          </h2>
          <Sep />
          <p className="reveal-left delay-2" style={{ fontSize: 22, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 620 }}>
            We're builders frustrated by the trade-off between useful AI and private AI. So we built the bridge.
          </p>
        </div>

        <div className="reveal-right delay-2" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24, minWidth: 500 }}>
          <div className="alive-card accent-indigo float-delay-1" style={{ display: 'flex', gap: 24, alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 20, padding: '28px 32px' }}>
            <PresenterCam width={100} height={100} label="" />
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Your Name</div>
              <div style={{ fontSize: 16, color: 'var(--indigo-light)', marginBottom: 10 }}>Founder &amp; Lead Engineer</div>
              <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5 }}>
                Cloud infrastructure, full-stack, AI/ML tooling.<br />
                Drop your photo here (circular, background removed).
              </div>
            </div>
          </div>

          <div className="alive-card accent-lav float-delay-2" style={{ display: 'flex', gap: 24, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px 32px' }}>
            <div className="alive-icon accent-lav" style={{ width: 100, height: 100, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>+</div>
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 }}>Team Member</div>
              <div style={{ fontSize: 15, color: 'var(--text3)' }}>Add your co-founders or advisors here</div>
            </div>
          </div>
        </div>
      </div>

      <SlideNum n={13} />
    </div>
  )
}
