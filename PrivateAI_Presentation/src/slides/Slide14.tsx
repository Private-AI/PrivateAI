import { GlowBlob, GridBg, Logo, Pill } from '../components'

export default function Slide14() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 1200, height: 1200, top: -300, left: '50%', transform: 'translateX(-50%)' }} />
      <GlowBlob type="teal"   style={{ width: 500, height: 500, bottom: -100, left: 100 }} />
      <GlowBlob type="lav"    style={{ width: 500, height: 500, bottom: -100, right: 100 }} />
      <GridBg />

      <div className="slide-content" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', height: '100%', padding: 80,
      }}>
        <div className="reveal-up" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 60 }}>
          <Logo size={104} />
        </div>

        <h1 className="reveal-up delay-1" style={{
          fontFamily: 'Outfit, sans-serif', fontSize: 100, fontWeight: 900,
          lineHeight: 1.0, letterSpacing: '-0.04em', marginBottom: 40,
        }}>
          <span style={{ color: 'var(--text)' }}>Your data. Your models.</span><br />
          <span className="grad-text">Your conversations.</span><br />
          <span style={{ color: 'var(--text)' }}>Finally, actually private.</span>
        </h1>

        <p className="reveal-up delay-2" style={{ fontSize: 26, color: 'var(--text2)', marginBottom: 60 }}>Thank you.</p>

        <div className="reveal-up delay-3" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pill variant="indigo" style={{ fontSize: 18, padding: '10px 24px' }}>🔗 privateai.app</Pill>
          <Pill variant="teal"   style={{ fontSize: 18, padding: '10px 24px' }}>📧 hello@privateai.app</Pill>
          <Pill variant="lav"    style={{ fontSize: 18, padding: '10px 24px' }}>🐦 @privateai</Pill>
        </div>
      </div>
    </div>
  )
}
