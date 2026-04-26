import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from './components'
import { SLIDES } from './slides'

const SPEAKER_NOTES = [
  "Hi, I'm Shabbir, and this is Team PrivateAI. Over the next 3 minutes I'll show you how anyone can have their own fully private AI in one click.",
  "Have you ever had a really private conversation with AI? Something you wouldn't want your employer, your IT team, or anyone else to read? Most people have. And most people have no idea those conversations are stored, logged, and could be subpoenaed.",
  "Public AI logs every prompt. Samsung employees leaked trade secrets through ChatGPT. Hospitals ban staff from using AI entirely. Lawyers and doctors can't risk it.",
  "Setting up your own AI server means days of SSH keys, GPU drivers, and firewall configs. One mistake and your data is exposed anyway.",
  "We believe every professional deserves access to AI without giving up their privacy. Not just enterprises with big IT teams.",
  "PrivateAI gives you both. One click to deploy your own private AI server. Hardware-encrypted. No cloud expertise required.",
  "Four steps: pick your cloud and GPU, connect in one click, watch your VM go live automatically, then hit Chat.",
  "Sarah is a nurse in Western Sydney. Her hospital bans all public AI. With PrivateAI, she deploys on the hospital's own Azure. Patient data never leaves the network. Compliance satisfied. Sarah gets her 2 hours back.",
  "Watch how easy the Azure setup is. One click, sign in with Microsoft, and credentials are done automatically.",
  "Now watch VM configuration, deployment, and the chat opening. We say hi.",
  "And this is the dashboard. Full control over every VM, live status, and a budget monitor with auto-shutdown.",
  "Legal firms reviewing privileged documents. Hospitals running AI diagnostics. Journalists protecting sources. Engineers with trade secrets. All of them, finally able to use AI safely.",
  "We're Shabbir and Team PrivateAI. We got frustrated by this trade-off and built the bridge.",
  "Your data. Your models. Your conversations. Finally, actually private. Thank you.",
]

type Direction = 'forward' | 'backward'

export default function App() {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState<Direction>('forward')
  const [animKey, setAnimKey] = useState(0)
  const [scale, setScale] = useState(1)
  const [notesVisible, setNotesVisible] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoAdvanceTimeout = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const clearVideoAdvance = useCallback(() => {
    if (videoAdvanceTimeout.current !== null) {
      window.clearTimeout(videoAdvanceTimeout.current)
      videoAdvanceTimeout.current = null
    }
  }, [])

  // Responsive scaling
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / 1920
      const sy = window.innerHeight / 1080
      setScale(Math.min(sx, sy))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const navigate = useCallback((dir: Direction) => {
    clearVideoAdvance()
    setCurrent(prev => {
      const next = dir === 'forward' ? prev + 1 : prev - 1
      if (next < 0 || next >= SLIDES.length) return prev
      setDirection(dir)
      setAnimKey(k => k + 1)
      return next
    })
  }, [clearVideoAdvance])

  const jumpTo = useCallback((index: number) => {
    clearVideoAdvance()
    setCurrent(prev => {
      setDirection(index > prev ? 'forward' : 'backward')
      setAnimKey(k => k + 1)
      return index
    })
  }, [clearVideoAdvance])

  // Auto-advance when video or audio ends
  useEffect(() => {
    const handler = () => {
      clearVideoAdvance()
      videoAdvanceTimeout.current = window.setTimeout(() => {
        videoAdvanceTimeout.current = null
        navigate('forward')
      }, 900)
    }
    window.addEventListener('privateai-media-ended', handler)
    return () => {
      window.removeEventListener('privateai-media-ended', handler)
      clearVideoAdvance()
    }
  }, [clearVideoAdvance, navigate])

  // Audio autoplay for non-video slides
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.src = ''
      audioRef.current = null
    }
    // Slides 01, 02, 06, 09, 10, 11, 12 (0-indexed 0, 1, 5, 8, 9, 10, 11) are video slides
    const VIDEO_SLIDES = [0, 1, 5, 8, 9, 10, 11]
    if (VIDEO_SLIDES.includes(current)) return

    const slideNum = current + 1
    const audio = new Audio(`/audio/slide${slideNum}.mp4`)
    audio.onended = () => window.dispatchEvent(new Event('privateai-media-ended'))
    audioRef.current = audio
    audio.play().catch(() => {})
    return () => {
      audio.pause()
      audio.onended = null
    }
  }, [current])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          navigate('forward')
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          navigate('backward')
          break
        case 'n':
        case 'N':
          setNotesVisible(v => !v)
          break
        case 'Escape':
          setNotesVisible(false)
          break
        case 'Home':
          jumpTo(0)
          break
        case 'End':
          jumpTo(SLIDES.length - 1)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, jumpTo])

  const SlideComponent = SLIDES[current]
  const animClass = direction === 'forward' ? 'slide-enter-forward' : 'slide-enter-backward'
  const progressPct = ((current + 1) / SLIDES.length) * 100
  const isHeroSlide = current === 0 || current === SLIDES.length - 1

  return (
    <div className="deck-stage" ref={stageRef}>
      {/* Progress bar */}
      <div className="progress-bar" style={{ width: `${progressPct}%` }} />

      {/* Slide canvas */}
      <div
        className="slide-viewport"
        style={{ transform: `scale(${scale})` }}
      >
        <div key={animKey} className={`slide ${animClass}`}>
          <SlideComponent />
          {!isHeroSlide && (
            <div className="slide-brand-mark">
              <Logo variant="icon" size={48} />
            </div>
          )}
        </div>
      </div>

      {/* Prev button */}
      <button
        className="nav-btn nav-btn-prev"
        onClick={() => navigate('backward')}
        disabled={current === 0}
        aria-label="Previous slide"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 5L7 10L12 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Next button */}
      <button
        className="nav-btn nav-btn-next"
        onClick={() => navigate('forward')}
        disabled={current === SLIDES.length - 1}
        aria-label="Next slide"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Navigation dots */}
      <div className="nav-dots">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            className={`nav-dot ${i === current ? 'active' : ''}`}
            onClick={() => jumpTo(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div className="slide-counter">
        {String(current + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
      </div>

      {/* Speaker notes hint */}
      <div className="notes-hint">Press N for speaker notes</div>

      {/* Speaker notes overlay */}
      <div className={`speaker-notes-overlay ${notesVisible ? 'visible' : ''}`}>
        <div className="speaker-notes-label">Speaker Notes - Slide {current + 1}</div>
        {SPEAKER_NOTES[current]}
      </div>
    </div>
  )
}
