import { useState } from 'react'
import { GlowBlob, SectionTag, SlideNum } from '../components'

interface Member {
  name: string
  role: string
  color: string
  accent: string
  bg: string
  border: string
  detail: string
  delay: string
  avatar: string
  initials: string
  featured?: boolean
}

const MEMBERS: Member[] = [
  {
    name: 'Zahead Rasheedi',
    role: 'Co-founder',
    color: 'var(--indigo-light)',
    accent: 'accent-teal',
    bg: 'rgba(99,102,241,0.06)',
    border: '1px solid rgba(99,102,241,0.25)',
    detail: 'Backend, security architecture & Azure integration.',
    delay: 'float-delay-1',
    avatar: '/zahead.jpeg',
    initials: 'ZR',
  },
  {
    name: 'Shabbir Kamal',
    role: 'Founder',
    color: 'var(--teal)',
    accent: 'accent-indigo',
    bg: 'rgba(45,212,191,0.06)',
    border: '1px solid rgba(45,212,191,0.25)',
    detail: 'Cloud infrastructure, full-stack & AI/ML tooling.',
    delay: 'float-delay-2',
    avatar: '/shabbir.jpeg',
    initials: 'SK',
    featured: true,
  },
  {
    name: 'Chen-Ju Lin (Chester)',
    role: 'Co-founder',
    color: 'var(--lavender)',
    accent: 'accent-lav',
    bg: 'rgba(167,139,250,0.06)',
    border: '1px solid rgba(167,139,250,0.25)',
    detail: 'Product design, frontend & user experience.',
    delay: 'float-delay-3',
    avatar: '/chester.jpeg',
    initials: 'CL',
  },
]

function MemberCard({ m }: { m: Member }) {
  const [imgFailed, setImgFailed] = useState(false)

  const photoSize = m.featured ? 244 : 220

  return (
    <div
      className={`alive-card ${m.accent} ${m.delay}`}
      style={{
        flex: m.featured ? 1.1 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', background: m.bg, border: m.border,
        borderRadius: 28, padding: '56px 24px 32px',
      }}
    >
      <div style={{
        width: photoSize, height: photoSize, borderRadius: '50%', flexShrink: 0,
        border: m.border, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28, boxShadow: '0 0 30px rgba(0,0,0,0.3)',
      }}>
        {imgFailed ? (
          <span style={{ fontSize: 60, fontWeight: 700, color: m.color }}>{m.initials}</span>
        ) : (
          <img
            src={m.avatar}
            alt={m.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.2 }}>{m.name}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>{m.role}</div>
      <div style={{ fontSize: 18, color: 'var(--text2)', lineHeight: 1.7 }}>{m.detail}</div>
    </div>
  )
}

export default function Slide13() {
  return (
    <div className="slide">
      <GlowBlob type="indigo" style={{ width: 1000, height: 1000, top: -300, left: -100 }} />
      <GlowBlob type="teal" style={{ width: 600, height: 600, bottom: -150, right: -100 }} />

      <div className="slide-content" style={{ display: 'flex', flexDirection: 'column', padding: '80px 120px', gap: 40 }}>
        <div className="reveal-up">
          <SectionTag style={{ marginBottom: 20 }}>The Team</SectionTag>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 52, fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 1, margin: 0,
          }}>
            Built by people who care about <span className="grad-text">your privacy.</span>
          </h2>
        </div>

        <div className="reveal-up delay-1" style={{ display: 'flex', gap: 24, alignItems: 'stretch' }}>
          {MEMBERS.map((m) => <MemberCard key={m.name} m={m} />)}
        </div>
      </div>

      <SlideNum n={13} />
    </div>
  )
}
