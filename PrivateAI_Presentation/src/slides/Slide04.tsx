import { GlowBlob, PresenterCam, SectionTag, Sep, SlideNum } from '../components'

export default function Slide04() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 800, height: 800, bottom: -200, left: -100 }} />

      <div className="slide-content" style={{ display: 'flex', alignItems: 'center', padding: '80px 120px', gap: 80 }}>
        <div className="reveal-left" style={{ flex: 1 }}>
          <SectionTag style={{
            background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)',
            color: '#f87171', marginBottom: 48,
          }}>The Problem (cont.)</SectionTag>

          <h2 className="reveal-left delay-1" style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 76, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 40,
          }}>
            The alternative?<br /><span style={{ color: '#f87171' }}>Days of pain.</span>
          </h2>

          <Sep />

          <p className="reveal-left delay-2" style={{ fontSize: 26, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 700, marginBottom: 48 }}>
            Setting up your own private AI means cloud consoles, GPU drivers, SSH keys, firewall rules, and network security.{' '}
            <strong style={{ color: 'var(--text)' }}>It's days of work and one mistake leaves your data exposed anyway.</strong>
          </p>

          <div className="alive-card accent-red" style={{ padding: '28px 32px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, maxWidth: 700 }}>
            <div style={{ fontSize: 32, fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: '#fca5a5', marginBottom: 8 }}>So teams are stuck.</div>
            <div style={{ fontSize: 20, color: 'var(--text2)' }}>Give up your privacy, or give up on AI entirely.</div>
          </div>
        </div>

        <div className="reveal-right delay-2" style={{ flexShrink: 0, width: 500 }}>
          <div className="alive-card scan-line accent-red" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: 32, fontFamily: 'monospace', fontSize: 15, color: 'var(--text3)', lineHeight: 1.8 }}>
            <div style={{ color: '#f87171', marginBottom: 8 }}># Setting up your own AI server</div>
            <div>$ az vm create --resource-group ...</div>
            <div>$ ssh -i ~/.ssh/id_rsa azureuser@...</div>
            <div>$ sudo apt-get install nvidia-driver...</div>
            <div>$ docker pull ollama/ollama:latest</div>
            <div>$ sudo ufw allow 11434/tcp</div>
            <div>$ ollama pull llama3...</div>
            <div style={{ color: '#f87171', marginTop: 16 }}>Error: CUDA version mismatch.</div>
            <div style={{ fontSize: 13, marginTop: 8 }}># 3 hours later...</div>
            <div style={{ color: '#f87171' }}>Error: Port already in use.</div>
            <div style={{ fontSize: 13, marginTop: 8 }}># 2 days later...</div>
            <div style={{ color: 'var(--teal)' }}># Still not working ✗</div>
          </div>
        </div>
      </div>

      <PresenterCam width={220} height={220} style={{ position: 'absolute', bottom: 60, right: 80 }} label="You" />
      <SlideNum n={4} />
    </div>
  )
}
