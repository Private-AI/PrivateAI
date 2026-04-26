import { useState } from 'react'

// ── GlowBlob ─────────────────────────────────────────────────────────────────
interface GlowBlobProps {
  type: 'indigo' | 'teal' | 'lav'
  style: React.CSSProperties
}
export function GlowBlob({ type, style }: GlowBlobProps) {
  return <div className={`glow glow-${type}`} style={style} />
}

// ── GridBg ───────────────────────────────────────────────────────────────────
export function GridBg() {
  return <div className="grid-bg" />
}

// ── SectionTag ───────────────────────────────────────────────────────────────
interface SectionTagProps {
  children: React.ReactNode
  style?: React.CSSProperties
}
export function SectionTag({ children, style }: SectionTagProps) {
  return (
    <div className="section-tag alive-tag reveal-up" style={style}>
      {children}
    </div>
  )
}

// ── Pill ─────────────────────────────────────────────────────────────────────
interface PillProps {
  children: React.ReactNode
  variant: 'teal' | 'indigo' | 'lav'
  style?: React.CSSProperties
}
export function Pill({ children, variant, style }: PillProps) {
  return (
    <div className={`pill pill-${variant} alive-pill accent-${variant}`} style={style}>
      {children}
    </div>
  )
}

// ── Sep ──────────────────────────────────────────────────────────────────────
export function Sep({ style }: { style?: React.CSSProperties }) {
  return <div className="sep" style={style} />
}

// ── SlideNum ─────────────────────────────────────────────────────────────────
export function SlideNum({ n }: { n: number }) {
  return (
    <div className="slide-num">
      {String(n).padStart(2, '0')} / 14
    </div>
  )
}

// ── Logo ─────────────────────────────────────────────────────────────────────
interface LogoProps {
  size?: number
  variant?: 'wordmark' | 'icon'
}

export function Logo({ size = 52, variant = 'wordmark' }: LogoProps) {
  const isWordmark = variant === 'wordmark'
  const width = isWordmark ? Math.round((size / 60) * 222) : size
  const src = isWordmark ? '/logos/logo-wordmark-dark.svg' : '/logos/logo-icon-transparent.svg'

  return (
    <div className={`brand-logo brand-logo-${variant} accent-indigo`} style={{ width, height: size }}>
      <img
        src={src}
        alt="PrivateAI"
        style={{ width, height: size }}
        draggable={false}
      />
    </div>
  )
}

// ── PresenterCam ─────────────────────────────────────────────────────────────
interface PresenterCamProps {
  width?: number
  height?: number
  style?: React.CSSProperties
  label?: string
  sublabel?: string
  /** Local video path served from /public. Replace with your own presenter video when ready. */
  videoSrc?: string
}
export function PresenterCam({
  width = 220,
  height = 220,
  style,
  label = 'Presenter\nbackground removed',
  sublabel,
  videoSrc = '/videos/placeholder_video_sample.webm',
}: PresenterCamProps) {
  return (
    <div
      className="presenter-cam accent-indigo"
      style={{ width, height, ...style }}
    >
      {videoSrc && (
        <video
          className="presenter-video"
          autoPlay
          muted
          loop
          preload="auto"
          playsInline
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/webm" />
        </video>
      )}
      {!videoSrc && <div style={{ fontSize: Math.max(20, width * 0.13), marginBottom: 8, opacity: 0.5 }}>🎥</div>}
      {!videoSrc && label && (
        <div style={{
          fontSize: Math.max(11, width * 0.06),
          color: 'rgba(99,102,241,0.7)',
          fontWeight: 600,
          lineHeight: 1.4,
          padding: '0 16px',
          textAlign: 'center',
          whiteSpace: 'pre-line',
        }}>
          {label}
        </div>
      )}
      {!videoSrc && sublabel && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4, color: 'rgba(99,102,241,0.7)' }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

// ── CheckItem ─────────────────────────────────────────────────────────────────
interface CheckItemProps {
  children: React.ReactNode
  color?: string
}
export function CheckItem({ children, color = 'var(--indigo)' }: CheckItemProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, color: 'var(--text2)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7L5.5 10.5L12 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      {children}
    </div>
  )
}

// ── DemoVideo ─────────────────────────────────────────────────────────────────
interface DemoVideoProps {
  label: string
  hint: string
  footer?: string
  /** Local video path served from /public. Replace per slide with your own recording when ready. */
  videoSrc?: string
  /** YouTube video ID — replace with real recording when ready */
  videoId?: string
  playColor?: string
  labelColor?: string
  playBtnStyle?: React.CSSProperties
  style?: React.CSSProperties
}
export function DemoVideo({
  label,
  hint,
  footer,
  videoSrc = '/videos/placeholder_video_sample.webm',
  videoId = 'dQw4w9WgXcQ',
  playColor = '#818cf8',
  labelColor,
  playBtnStyle,
  style,
}: DemoVideoProps) {
  const [playing, setPlaying] = useState(false)
  const accentClass = playColor === '#2dd4bf'
    ? 'accent-teal'
    : playColor === '#a78bfa'
      ? 'accent-lav'
      : 'accent-indigo'

  if (playing) {
    return (
      <div
        className="demo-video"
        style={{ ...style, border: 'none', background: '#000', cursor: 'default', padding: 0 }}
      >
        {videoSrc ? (
          <video
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 20, objectFit: 'cover' }}
            autoPlay
            controls
            preload="auto"
            playsInline
            onEnded={() => window.dispatchEvent(new Event('privateai-demo-video-ended'))}
            title={label}
          >
            <source src={videoSrc} type="video/webm" />
          </video>
        ) : (
          <iframe
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 20 }}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={label}
          />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setPlaying(false) }}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', cursor: 'pointer', borderRadius: 6,
            padding: '4px 10px', fontSize: 12, fontFamily: 'Outfit, sans-serif',
          }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className={`demo-video alive-card scan-line ${accentClass}`} style={style} onClick={() => setPlaying(true)}>
      {videoSrc && (
        <video
          className="demo-video-preview"
          autoPlay
          muted
          loop
          preload="auto"
          playsInline
          aria-hidden="true"
        >
          <source src={videoSrc} type="video/webm" />
        </video>
      )}
      <div className="demo-video-overlay" />
      <div
        className="play-btn"
        style={{ borderColor: playColor, ...playBtnStyle }}
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <polygon points="10,7 22,14 10,21" fill={playColor} />
        </svg>
      </div>
      <div className="demo-video-copy">
        <div className="video-label" style={labelColor ? { color: labelColor } : undefined}>
          {label}
        </div>
        <div className="video-hint">{hint}</div>
      </div>
      {footer && (
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          textAlign: 'center', fontSize: 13, color: 'var(--text3)', zIndex: 3,
        }}>
          {footer}
        </div>
      )}
    </div>
  )
}
