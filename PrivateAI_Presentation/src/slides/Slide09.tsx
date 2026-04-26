import { DemoVideo, GlowBlob, SectionTag, Sep, SlideNum } from '../components'

export default function Slide09() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 900, height: 900, top: -200, left: -100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flexShrink: 0, maxWidth: 440 }}>
          <SectionTag style={{ marginBottom: 36 }}>Demo — 1 of 3</SectionTag>
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 68, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 32,
          }}>
            From zero to<br /><span className="grad-text">private AI.</span>
          </h2>
          <Sep />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { color: 'var(--indigo)', text: 'Open app → Dashboard' },
              { color: 'var(--indigo)', text: 'New Deployment → Provision Wizard' },
              { color: 'var(--indigo)', text: 'Select H100 Confidential → Deploy' },
              { color: 'var(--teal)',   text: 'Watch 13-step WebSocket progress' },
            ].map(({ color, text }) => (
              <div key={text} className="reveal-left delay-2" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, color: 'var(--text2)' }}>
                <div className="alive-icon" style={{ width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7L5.5 10.5L12 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        <DemoVideo
          label="🎬 Demo Video 1"
          hint="Drop in your screen recording here. Sped-up 4× — show wizard → cloud credentials → H100 selection → real-time deploy progress"
          footer="Recommended: 30–45 sec at 4× speed · Background music · No voiceover"
          videoId="dQw4w9WgXcQ"
          style={{ flex: 1, height: 700 }}
        />
      </div>

      <SlideNum n={9} />
    </div>
  )
}
