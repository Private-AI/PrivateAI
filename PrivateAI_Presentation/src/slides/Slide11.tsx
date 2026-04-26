import { DemoVideo, GlowBlob, SectionTag, Sep, SlideNum } from '../components'

export default function Slide11() {
  return (
    <div className="slide">
      <GlowBlob type="lav" style={{ width: 700, height: 700, top: -100, right: 100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flexShrink: 0, maxWidth: 440 }}>
          <SectionTag style={{
            background: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.3)',
            color: 'var(--lavender)', marginBottom: 36,
          }}>Demo — 3 of 3</SectionTag>
          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 68, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 32,
          }}>
            Full control.<br /><span style={{ color: 'var(--lavender)' }}>Zero surprises.</span>
          </h2>
          <Sep style={{ background: 'linear-gradient(90deg,var(--lavender),var(--teal))' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="reveal-left delay-2" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--lavender)', display: 'inline-block' }}>●</span>  Manage all instances</div>
            <div className="reveal-left delay-3" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--teal)', display: 'inline-block' }}>●</span> Real-time Monitoring of Status</div>
            <div className="reveal-left delay-4" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--indigo-light)', display: 'inline-block' }}>●</span> Budget Monitor with Auto-shutdown</div>
            <div className="reveal-left delay-5" style={{ fontSize: 20, color: 'var(--text2)' }}><span className="alive-icon" style={{ color: 'var(--lavender)', display: 'inline-block' }}>●</span> Start, stop, Connect &amp; Chat per VM</div>
          </div>
        </div>

        <DemoVideo
          label="🎬 Demo Video 3"
          hint="Drop in your screen recording here. Show: Dashboard with multiple VMs → Expand 'More VMs' → Budget monitor bar → Stop a VM → Cost drops"
          footer="Recommended: 20–25 sec · Highlight the real-time cost monitor bar · Multi-VM view"
          videoId="dQw4w9WgXcQ"
          playColor="#a78bfa"
          labelColor="var(--lavender)"
          playBtnStyle={{ background: 'rgba(167,139,250,0.2)', borderColor: 'rgba(167,139,250,0.5)' }}
          style={{ flex: 1, height: 700 }}
        />
      </div>

      <SlideNum n={11} />
    </div>
  )
}
