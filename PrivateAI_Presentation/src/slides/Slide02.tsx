import { GlowBlob, GridBg, PresenterCam, Sep, SlideNum } from '../components'

export default function Slide02() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 1000, height: 1000, top: -300, right: -200 }} />
      <GridBg />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '0 120px', gap: 100 }}>
        <div className="reveal-left" style={{ flex: 1 }}>
          <Sep />
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 72, fontWeight: 800,
            lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 40,
            color: 'rgb(246,246,246)',
          }}>
            Do you have AI conversations<br /><br />
            <span className="grad-text-warm">you wouldn't want shared?</span>
          </h2>
          <p className="reveal-left delay-2" style={{ fontSize: 26, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 780 }}>
            Medical advice. Legal questions. Client data. Something personal?<br />
            <strong style={{ color: 'var(--text)' }}>Those conversations weren't private.</strong>
          </p>
        </div>

        <div className="reveal-right delay-3" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <PresenterCam
            width={360}
            height={360}
            videoSrc="/videos/slide2.mp4"
            videoStyle={{ objectFit: 'contain', objectPosition: 'center' }}
            muted={false}
            loop={false}
            logoPattern
            onEnded={() => window.dispatchEvent(new Event('privateai-media-ended'))}
          />
        </div>
      </div>

      <SlideNum n={2} />
    </div>
  )
}
