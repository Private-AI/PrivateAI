import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from './components'
import { SLIDES } from './slides'

const SPEAKER_NOTES = [
  "Welcome everyone. I'm [Your Name] and this is PrivateAI. Over the next 3 minutes I want to show you something that I think is genuinely overdue.",
  "I want to start with a quick question. Raise your hand if you've used ChatGPT, Claude, or Gemini. Now — keep your hand up if you've had a conversation you wouldn't want shared with anyone. Medical advice. Legal questions. Client data. Something personal. Here's the thing... those conversations weren't private.",
  "Right now, using AI means surrendering your privacy. Every prompt you send to ChatGPT or Claude becomes data that can be subpoenaed, leaked, or reviewed by employees. For doctors, lawyers, journalists, engineers handling trade secrets — this is a dealbreaker. Samsung employees leaked IP through ChatGPT. Hospitals ban AI entirely. Legal firms pay millions to avoid the risk.",
  "But the alternative isn't much better. Setting up your own private AI means wrestling with cloud consoles, GPU drivers, SSH keys, and network security configs. It's days of work — and one mistake leaves your data exposed anyway. So teams are stuck: give up your privacy, or give up on AI entirely.",
  "PrivateAI is the best of both worlds. One click to deploy your own fully private AI server — with hardware-level encryption — and one dashboard to manage it. No cloud expertise required. Your data never touches our servers. Your conversations stay yours.",
  "Here's how it works. Four steps. Choose your cloud and GPU profile. Connect your credentials with one click — or just sign in via Microsoft OAuth. We handle everything: provisioning the VM, firewall, GPU drivers, pulling the AI models. Then you hit Connect and Chat — and you're talking to your own private AI.",
  "Let me show you step one — the deployment wizard. Watch this: from zero to running in under 5 minutes. Real-time progress, 13 steps, WebSocket-driven so you see exactly what's happening. [Play Demo Video 1]",
  "Sarah is one of thousands of professionals we're building for. A nurse in Western Sydney who knows AI could save her hours every day — but every tool she tries gets shut down by compliance. PrivateAI gives her a private server on her hospital's own Azure subscription. Patient data never leaves the network. Compliance is satisfied. Sarah gets her 2 hours back.",
  "And here's what you get. Open WebUI — a full-featured chat interface — talking directly and only to your server. Your prompts are encrypted in transit. Nothing is logged on our end. Nothing goes to third parties. [Play Demo Video 2]",
  "And this is the dashboard. Multiple VMs, live metrics, a budget monitor with auto-shutdown so you're never surprised by a cloud bill. Full control. [Play Demo Video 3]",
  "Think about who this unlocks. A law firm that can now analyse privileged documents with AI. A hospital running AI diagnostics without violating patient privacy. A journalist querying sensitive sources without leaving a trail. An engineer reviewing proprietary code without risking trade secrets. We're making privacy-preserving AI accessible to everyone.",
  "We're a small team who got frustrated by this trade-off and decided to build the bridge. [Introduce yourself and any co-founders here.]",
  "With PrivateAI... your data, your models, your conversations — safe, confidential, and finally, actually private. Thank you.",
  "With PrivateAI... your data, your models, your conversations — safe, confidential, and finally, actually private. Thank you.",
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

  useEffect(() => {
    const handler = () => {
      clearVideoAdvance()
      videoAdvanceTimeout.current = window.setTimeout(() => {
        videoAdvanceTimeout.current = null
        navigate('forward')
      }, 900)
    }

    window.addEventListener('privateai-demo-video-ended', handler)
    return () => {
      window.removeEventListener('privateai-demo-video-ended', handler)
      clearVideoAdvance()
    }
  }, [clearVideoAdvance, navigate])

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
        <div className="speaker-notes-label">Speaker Notes — Slide {current + 1}</div>
        {SPEAKER_NOTES[current]}
      </div>
    </div>
  )
}
