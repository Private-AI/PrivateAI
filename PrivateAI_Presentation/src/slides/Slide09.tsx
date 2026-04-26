import { DemoVideo, GlowBlob, PresenterCam, SectionTag, Sep, SlideNum } from '../components'

export default function Slide09() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 900, height: 900, top: -200, left: -100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flexShrink: 0, maxWidth: 440 }}>
          <SectionTag style={{ marginBottom: 36 }}>Demo 1 of 3</SectionTag>
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 68, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 32,
          }}>
            Azure setup.<br /><span className="grad-text">One click.</span>
          </h2>
          <Sep />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { color: 'var(--indigo)', text: 'Click "Connect to Azure"' },
              { color: 'var(--indigo)', text: 'Sign in with Microsoft account' },
              { color: 'var(--teal)',   text: 'Credentials configured automatically' },
              { color: 'var(--teal)',   text: 'Ready to deploy' },
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
          label="Demo 1 - Azure Setup"
          videoSrc="/videos/Azure.mp4"
          playbackRate={2.05}
          style={{ flex: 1, height: 700 }}
        />
      </div>

      <PresenterCam
        width={220}
        height={220}
        style={{ position: 'absolute', bottom: 60, left: 80 }}
        videoSrc="/videos/Slide9.mp4"
        videoStyle={{ objectFit: 'contain', objectPosition: 'center' }}
        muted={false}
        loop={false}
        logoPattern
      />

      <SlideNum n={9} />
    </div>
  )
}
