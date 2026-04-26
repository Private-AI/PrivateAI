import { DemoVideo, GlowBlob, PresenterCam, SectionTag, Sep, SlideNum } from '../components'

export default function Slide11() {
  return (
    <div className="slide">
      <GlowBlob type="lav" style={{ width: 700, height: 700, top: -100, right: 100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flexShrink: 0, maxWidth: 440 }}>
          <SectionTag style={{
            background: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.3)',
            color: 'var(--lavender)', marginBottom: 36,
          }}>Demo 3 of 3</SectionTag>
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 68, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 32,
          }}>
            Your dashboard.<br /><span style={{ color: 'var(--lavender)' }}>Full control.</span>
          </h2>
          <Sep style={{ background: 'linear-gradient(90deg,var(--lavender),var(--teal))' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="reveal-left delay-2" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--lavender)', display: 'inline-block' }}>●</span>  Manage all your VM instances</div>
            <div className="reveal-left delay-3" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--teal)', display: 'inline-block' }}>●</span> Real-time status and health monitoring</div>
            <div className="reveal-left delay-4" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--indigo-light)', display: 'inline-block' }}>●</span> Budget tracker with auto-shutdown</div>
            <div className="reveal-left delay-5" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--lavender)', display: 'inline-block' }}>●</span> Start, stop, and open chat per VM</div>
          </div>
        </div>

        <DemoVideo
          label="Demo 3 - Dashboard"
          videoSrc="/videos/Dashboard.mp4"
          playbackRate={2.2}
          style={{ flex: 1, height: 700 }}
        />
      </div>

      <PresenterCam
        width={220}
        height={220}
        style={{ position: 'absolute', bottom: 60, left: 80 }}
        videoSrc="/videos/Slide11.mp4"
        videoStyle={{ objectFit: 'contain', objectPosition: 'center' }}
        muted={false}
        loop={false}
        logoPattern
      />

      <SlideNum n={11} />
    </div>
  )
}
