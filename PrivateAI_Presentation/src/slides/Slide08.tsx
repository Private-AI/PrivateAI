import { GlowBlob, SectionTag, SlideNum } from '../components'

export default function Slide08() {
  return (
    <div className="slide">
      <GlowBlob type="lav"  style={{ width: 800, height: 800, top: -200, right: -100 }} />
      <GlowBlob type="teal" style={{ width: 400, height: 400, bottom: -100, left: 200 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        {/* Left: persona */}
        <div className="reveal-left delay-1" style={{ flexShrink: 0, width: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div className="alive-card alive-icon accent-lav" style={{
            width: 220, height: 220, borderRadius: '50%',
            background: 'rgba(167,139,250,0.1)',
            border: '3px solid rgba(167,139,250,0.4)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <img
              src="/sarah.jpeg"
              alt="Sarah"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                const parent = (e.target as HTMLImageElement).parentElement
                if (parent) parent.innerHTML = '<div style="font-size:72px">👩‍⚕️</div>'
              }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 36, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Sarah</div>
            <div style={{ fontSize: 18, color: 'var(--lavender)', fontWeight: 600 }}>Registered Nurse, Western Sydney</div>
          </div>
          <div className="alive-card accent-red" style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 16, padding: '20px 24px', textAlign: 'center', width: '100%',
          }}>
            <div style={{ fontSize: 14, color: '#f87171', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Blocked from AI</div>
            <div style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.5 }}>Hospital policy bans all public AI tools. Patient data cannot leave the network.</div>
          </div>
        </div>

        {/* Right: story */}
        <div className="reveal-right delay-1" style={{ flex: 1 }}>
          <SectionTag style={{
            background: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.3)',
            color: 'var(--lavender)', marginBottom: 40,
          }}>Real User Story</SectionTag>

          <h2 className="reveal-right delay-2" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 56, fontWeight: 900,
            letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 36,
          }}>
            Sarah needs AI.<br />
            <span style={{ color: '#f87171' }}>Her hospital says no.</span><br />
            <span className="grad-text">PrivateAI says yes.</span>
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="alive-card accent-red float-delay-1" style={{
              display: 'flex', gap: 20, alignItems: 'flex-start',
              padding: '20px 24px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)', borderRadius: 14,
            }}>
              <div className="alive-icon accent-red" style={{ fontSize: 28, flexShrink: 0 }}>😰</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>The problem</div>
                <div style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.5 }}>Sarah spends 2 hours a day on admin. She knows AI could halve that. But every tool uploads data to external servers. Compliance shuts it down every time.</div>
              </div>
            </div>
            <div className="alive-card accent-teal float-delay-2" style={{
              display: 'flex', gap: 20, alignItems: 'flex-start',
              padding: '20px 24px', background: 'rgba(45,212,191,0.06)',
              border: '1px solid rgba(45,212,191,0.2)', borderRadius: 14,
            }}>
              <div className="alive-icon accent-teal" style={{ fontSize: 28, flexShrink: 0 }}>✅</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>With PrivateAI</div>
                <div style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.5 }}>Sarah deploys on the hospital's own Azure in 5 minutes. Patient data never leaves the network. Compliance is satisfied. Sarah gets her 2 hours back.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SlideNum n={8} />
    </div>
  )
}
