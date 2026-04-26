
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
  videoStyle?: React.CSSProperties
  label?: string
  sublabel?: string
  videoSrc?: string
  muted?: boolean
  loop?: boolean
  logoPattern?: boolean
  onEnded?: () => void
}
export function PresenterCam({
  width = 220,
  height = 220,
  style,
  videoStyle,
  label = 'Presenter\nbackground removed',
  sublabel,
  videoSrc = '/videos/placeholder_video_sample.webm',
  muted = true,
  loop = true,
  logoPattern = false,
  onEnded,
}: PresenterCamProps) {
  return (
    <div
      className="presenter-cam accent-indigo"
      style={{ width, height, ...style }}
    >
      {logoPattern && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          backgroundImage: "url('/logos/logo-icon-transparent.svg')",
          backgroundRepeat: 'repeat', backgroundSize: '72px',
          opacity: 0.22, pointerEvents: 'none',
          animation: 'logoDrift 8s linear infinite',
        }} />
      )}
      {videoSrc && (
        <video
          className="presenter-video"
          autoPlay
          muted={muted}
          loop={loop}
          preload="auto"
          playsInline
          style={videoStyle}
          onEnded={onEnded}
        >
          <source src={videoSrc} type="video/mp4" />
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
  hint?: string
  videoSrc?: string
  playbackRate?: number
  autoAdvance?: boolean
  playColor?: string
  labelColor?: string
  playBtnStyle?: React.CSSProperties
  style?: React.CSSProperties
}
export function DemoVideo({
  label,
  videoSrc = '/videos/placeholder_video_sample.webm',
  playbackRate = 1,
  autoAdvance = true,
  style,
}: DemoVideoProps) {
  const videoType = videoSrc.endsWith('.mp4') ? 'video/mp4' : 'video/webm'

  return (
    <div
      className="demo-video"
      style={{ ...style, border: 'none', background: '#000', cursor: 'default', padding: 0 }}
    >
      <video
        style={{ width: '100%', height: '100%', border: 'none', borderRadius: 20, objectFit: 'contain', background: '#000' }}
        autoPlay
        muted
        preload="auto"
        playsInline
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = playbackRate
        }}
        onEnded={() => {
          if (autoAdvance) window.dispatchEvent(new Event('privateai-media-ended'))
        }}
        title={label}
      >
        <source src={videoSrc} type={videoType} />
        {videoSrc.endsWith('.webm') && <source src={videoSrc.replace('.webm', '.mp4')} type="video/mp4" />}
      </video>
    </div>
  )
}
