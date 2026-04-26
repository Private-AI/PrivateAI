import { GlowBlob, GridBg, Logo, Pill, PresenterCam, SlideNum } from '../components'

export default function Slide01() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 900, height: 900, top: -200, left: -100 }} />
      <GlowBlob type="teal"   style={{ width: 600, height: 600, bottom: -100, right: 200 }} />
      <GridBg />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '0 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flex: 1, minWidth: 0 }}>
          <div className="delay-1" style={{ marginBottom: 60 }}>
            <Logo size={88} />
          </div>

          <Pill variant="indigo" style={{ marginBottom: 32, fontSize: 17 }}>Hackathon Final Pitch</Pill>

          <h1 className="reveal-left delay-2" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 110, fontWeight: 900,
            lineHeight: 0.95, letterSpacing: '-0.04em', marginBottom: 40,
          }}>
            <span className="grad-text">Your AI.</span><br />
            <span style={{ color: 'var(--text)' }}>Completely</span><br />
            <span style={{ color: 'var(--text)' }}>private.</span>
          </h1>

          <p className="reveal-left delay-3" style={{ fontSize: 26, color: 'var(--text2)', lineHeight: 1.5, maxWidth: 620, marginBottom: 24 }}>
            One click to deploy your own private AI server. No cloud expertise. No privacy trade-offs.
          </p>

          <p className="reveal-left delay-3" style={{ fontSize: 22, color: 'var(--text3)', marginBottom: 40 }}>
            Shabbir Kamal &nbsp;&middot;&nbsp; Zahead Rasheedi &nbsp;&middot;&nbsp; Chen-Ju Lin
          </p>

          <div className="reveal-up delay-4" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill variant="teal">No data stored on our servers</Pill>
            <Pill variant="lav">Hardware-level encryption</Pill>
            <Pill variant="indigo">5-min setup</Pill>
          </div>
        </div>

        <div className="reveal-right delay-3" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <PresenterCam
            width={520}
            height={520}
            videoSrc="/videos/slide1.mp4"
            videoStyle={{ objectFit: 'contain', objectPosition: 'center' }}
            muted={false}
            loop={false}
            logoPattern
            onEnded={() => window.dispatchEvent(new Event('privateai-media-ended'))}
          />
        </div>
      </div>

      <SlideNum n={1} />
    </div>
  )
}
