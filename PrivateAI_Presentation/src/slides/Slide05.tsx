import { GlowBlob, GridBg, Pill, SectionTag, Sep, SlideNum } from '../components'

export default function Slide05() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 900, height: 900, top: -200, right: -100 }} />
      <GlowBlob type="teal"   style={{ width: 500, height: 500, bottom: -100, left: 100 }} />
      <GridBg />

      <div className="slide-content" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', height: '100%', padding: '80px 160px',
      }}>
        <SectionTag style={{ marginBottom: 48 }}>Our Vision</SectionTag>

        <h2 className="reveal-up delay-1" style={{
          fontFamily: 'Outfit, sans-serif', fontSize: 96, fontWeight: 900,
          letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 48,
        }}>
          <span className="grad-text">Anyone</span> should be able<br />
          to use AI — <span style={{ color: 'var(--text)' }}>privately.</span>
        </h2>

        <Sep style={{ margin: '0 auto 48px' }} />

        <p className="reveal-up delay-2" style={{ fontSize: 28, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 900, marginBottom: 56 }}>
          Not just developers. Not just enterprises with IT teams.<br />
          <strong style={{ color: 'var(--text)' }}>Every professional, every small business, every individual</strong> — without needing a computer science degree or a six-figure cloud budget.
        </p>

        <div className="reveal-up delay-3" style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Pill variant="indigo" style={{ fontSize: 18, padding: '12px 28px' }}>No cloud expertise needed</Pill>
          <Pill variant="teal"   style={{ fontSize: 18, padding: '12px 28px' }}>One click. Fully private.</Pill>
          <Pill variant="lav"    style={{ fontSize: 18, padding: '12px 28px' }}>Your data stays yours</Pill>
        </div>
      </div>

      <SlideNum n={5} />
    </div>
  )
}
