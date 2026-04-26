import { DemoVideo, GlowBlob, SectionTag, Sep, SlideNum } from '../components'

export default function Slide10() {
  return (
    <div className="slide">
      <GlowBlob type="teal" style={{ width: 800, height: 800, bottom: -200, right: -100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <DemoVideo
          label="Demo 2 - Deploy and Chat"
          videoSrc="/videos/demo2.webm"
          style={{ flex: 1, height: 700 }}
        />

        <div className="reveal-right" style={{ flexShrink: 0, maxWidth: 440 }}>
          <SectionTag style={{
            background: 'rgba(45,212,191,0.1)', borderColor: 'rgba(45,212,191,0.3)',
            color: 'var(--teal)', marginBottom: 36,
          }}>Demo 2 of 3</SectionTag>
          <h2 className="reveal-right delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 68, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 32,
          }}>
            Configure.<br />
            <span style={{ color: 'var(--teal)' }}>Deploy.</span><br />
            <span style={{ color: 'var(--teal)' }}>Chat.</span>
          </h2>
          <Sep style={{ background: 'linear-gradient(90deg,var(--teal),var(--indigo))' }} />
          <p className="reveal-right delay-2" style={{ fontSize: 20, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 32 }}>
            Select your VM, hit deploy, watch 13 steps complete live, then open chat and say hi.
          </p>
          <div className="alive-card accent-teal" style={{ padding: '20px 24px', background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: 12 }}>
            <div style={{ fontSize: 15, color: 'var(--teal)', fontWeight: 700 }}>What never happens:</div>
            <div style={{ fontSize: 16, color: 'var(--text2)', marginTop: 8, lineHeight: 1.7 }}>
              Your prompts going to PrivateAI servers<br />
              Your data used for model training<br />
              Any third party seeing your conversations
            </div>
          </div>
        </div>
      </div>

      <SlideNum n={10} />
    </div>
  )
}
