# PrivateAI — Pitch Deck Presentation Context

## What This Is

A 14-slide hackathon pitch deck built as an animated React/Vite web app. Runs in Docker. Navigate with arrow keys. Speaker notes toggle with `N`.

**Live at:** `http://localhost:6173` (after `docker compose up --build`)

---

## The Product: PrivateAI

**One-line pitch:** One click to deploy your own private AI server. No cloud expertise. No privacy trade-offs.

**Core problem:** Using public AI (ChatGPT, Claude, Gemini) means every prompt is logged, stored, and potentially subpoenaed. Professionals in healthcare, law, journalism, and engineering can't use public AI at all. The DIY alternative (self-hosting) takes days and leaves you exposed if you make one mistake.

**The solution:** PrivateAI provisions a fully private AI server on your own cloud account (Azure, AWS, GCP) in one click. Your data never touches PrivateAI's servers. Hardware-level encryption via AMD SEV-SNP on H100 GPU profiles. Open WebUI runs directly against your VM.

**Tech stack (the actual product):**
- FastAPI backend + Next.js frontend
- Azure confidential VMs (AMD SEV-SNP)
- Ollama for local LLM inference
- Open WebUI for chat interface
- Real-time WebSocket provisioning (13-step pipeline)
- Budget monitor with auto-shutdown

---

## Presentation Tech Stack

| Item | Detail |
|------|--------|
| Framework | React 19 + Vite 6 + TypeScript |
| Font | Outfit (Google Fonts) |
| Styling | Inline styles + CSS custom properties |
| Canvas | 1920×1080, scaled to viewport |
| Transitions | Vertical slide (up/down) via CSS keyframes |
| Docker | `node:current-alpine`, port 6173→5173 |

**Key commands:**
```bash
# Start
cd PrivateAI_Presentation && docker compose up --build

# Type check
docker compose exec web npx tsc --noEmit
```

---

## Navigation Controls

| Key | Action |
|-----|--------|
| `→` `↓` `Space` | Next slide |
| `←` `↑` | Previous slide |
| `N` | Toggle speaker notes |
| `Esc` | Close speaker notes |
| `Home` / `End` | First / last slide |

---

## Slide-by-Slide Breakdown

### Slide 01 — Title
**Label:** Your AI. Completely private.

**Content:**
- PrivateAI logo + wordmark
- "Hackathon Final Pitch" pill
- H1: "Your AI. / Completely / private."
- Subline: "One click to deploy your own private AI server. No cloud expertise. No privacy trade-offs."
- Pills: "No data stored on our servers" · "Hardware-level encryption" · "5-min setup"
- Large presenter cam placeholder (520×520)

**Speaker note:** Welcome everyone. I'm [Your Name] and this is PrivateAI. Over the next 3 minutes I want to show you something that I think is genuinely overdue.

---

### Slide 02 — The Hook
**Label:** Do you have AI conversations you wouldn't want shared?

**Content:**
- No section tag — opens cold with a separator line
- H2: "Do you have AI conversations / [blank line] / you wouldn't want shared?"
- Body: "Medical advice. Legal questions. Client data. Something personal? **Those conversations weren't private.**"
- Medium presenter cam (360×360)

**Speaker note:** Raise your hand if you've used ChatGPT, Claude, or Gemini. Now — keep your hand up if you've had a conversation you wouldn't want shared. Medical advice. Legal questions. Client data. Something personal. Here's the thing... those conversations weren't private.

---

### Slide 03 — The Problem (1 of 2)
**Label:** Using AI today means surrendering your privacy.

**Content:**
- Red section tag: "The Problem"
- H2: "Using AI today means / surrendering / your privacy."
- Three red cards:
  - 📋 **Logged & stored** — Every prompt can be subpoenaed, leaked, or reviewed
  - 🏥 **Dealbreaker for professionals** — Doctors, lawyers, journalists can't risk it
  - 📰 **It's already happening** — Samsung IP leak, hospital bans, legal firm payouts
- Small presenter cam (bottom-right)

**Speaker note:** Right now, using AI means surrendering your privacy. Every prompt you send to ChatGPT or Claude becomes data that can be subpoenaed, leaked, or reviewed by employees. For doctors, lawyers, journalists, engineers handling trade secrets — this is a dealbreaker. Samsung employees leaked IP through ChatGPT. Hospitals ban AI entirely. Legal firms pay millions to avoid the risk.

---

### Slide 04 — The Problem (2 of 2)
**Label:** The alternative? Days of pain.

**Content:**
- Red section tag: "The Problem (cont.)"
- H2: "The alternative? / Days of pain."
- Body explaining the DIY complexity
- Red callout box: "So teams are stuck. Give up your privacy —or— give up on AI entirely."
- Terminal code block showing the nightmare of manual setup (CUDA errors, port conflicts)
- Small presenter cam (bottom-right)

**Speaker note:** But the alternative isn't much better. Setting up your own private AI means wrestling with cloud consoles, GPU drivers, SSH keys, and network security configs. It's days of work — and one mistake leaves your data exposed anyway. So teams are stuck: give up your privacy, or give up on AI entirely.

---

### Slide 05 — Our Vision *(new slide)*
**Label:** Anyone should be able to use AI — privately.

**Content:**
- Centered layout with grid background
- Section tag: "Our Vision"
- H2: "Anyone should be able / to use AI — privately."
- Body: "Not just developers. Not just enterprises with IT teams. Every professional, every small business, every individual — without needing a computer science degree or a six-figure cloud budget."
- Pills: "No cloud expertise needed" · "One click. Fully private." · "Your data stays yours"

**Speaker note:** PrivateAI is the best of both worlds. One click to deploy your own fully private AI server — with hardware-level encryption — and one dashboard to manage it. No cloud expertise required. Your data never touches our servers. Your conversations stay yours.

---

### Slide 06 — The Solution
**Label:** The best of both worlds.

**Content:**
- Section tag: "The Solution"
- H2: "The best of / both worlds." (gradient text)
- Body: "PrivateAI deploys your own fully private AI server with hardware-level encryption in one click."
- Pills: ✓ Your cloud · ✓ One-click setup · ✓ Hardware encryption · ✓ Real-time cost control · ✓ Works in 5 minutes
- Before/After comparison boxes on the right (480px)
- Small presenter cam (bottom-right)

**Speaker note:** Here's how it works. Four steps. Choose your cloud and GPU profile. Connect your credentials with one click — or just sign in via Microsoft OAuth. We handle everything: provisioning the VM, firewall, GPU drivers, pulling the AI models. Then you hit Connect and Chat — and you're talking to your own private AI.

---

### Slide 07 — How It Works
**Label:** Zero to private AI in 5 minutes.

**Content:**
- Section tag: "How It Works"
- H2: "Zero to private AI in 5 minutes."
- 4-column step grid:
  - **01 — Choose your cloud:** Azure/AWS/GCP, GPU profiles including H100 SEV-SNP
  - **02 — Connect in one click:** OAuth or credentials, we handle the rest
  - **03 — Your VM is live:** 13-step WebSocket progress, real-time dashboard
  - **04 — Connect & Chat:** Open WebUI against your server, prompts never touch our infra

**Speaker note:** Let me show you step one — the deployment wizard. Watch this: from zero to running in under 5 minutes. Real-time progress, 13 steps, WebSocket-driven so you see exactly what's happening.

---

### Slide 08 — Real User Story *(new slide)*
**Label:** Sarah needs AI. Her hospital says no. PrivateAI says yes.

**Content:**
- Left: Persona card — Sarah, 👩‍⚕️ Registered Nurse, Western Sydney. "Blocked from AI" red badge.
- Right: Lavender section tag "Real User Story"
- H2: "Sarah needs AI. / Her hospital says no. / PrivateAI says yes."
- Two story cards:
  - 😰 **The problem:** 2 hrs/day on admin, compliance team blocks every AI tool
  - ✅ **With PrivateAI:** 5-min deploy on hospital's Azure, data stays in-network, 2 hours back every day

**Speaker note:** Sarah is one of thousands of professionals we're building for. A nurse in Western Sydney who knows AI could save her hours every day — but every tool she tries gets shut down by compliance. PrivateAI gives her a private server on her hospital's own Azure subscription. Patient data never leaves the network. Compliance is satisfied. Sarah gets her 2 hours back.

---

### Slide 09 — Demo 1: Deploy
**Label:** From zero to private AI.

**Content:**
- Section tag: "Demo — 1 of 3"
- H2: "From zero to / private AI."
- Checklist:
  - ✓ Open app → Dashboard
  - ✓ New Deployment → Provision Wizard
  - ✓ Select H100 Confidential → Deploy
  - ✓ Watch 13-step WebSocket progress
- **Video slot:** Screen recording of the deploy wizard → H100 selection → live progress

**Video guidance:** 30–45 sec at 4× speed · Background music · No voiceover

**Speaker note:** Let me show you step one — the deployment wizard. [Play Demo Video 1]

---

### Slide 10 — Demo 2: Chat
**Label:** Chat. Completely private.

**Content:**
- Section tag: "Demo — 2 of 3" (teal)
- H2: "Chat. / Completely / private." (teal accents)
- Body: "Prompts are encrypted in transit and never stored on our servers."
- Privacy box: 🔒 What never happens — prompts to our servers, training use, third-party access
- **Video slot:** Dashboard → Connect & Chat → Open WebUI → real AI response → privacy badge

**Video guidance:** 20–30 sec · Show the "Private" badge clearly · Real AI response

**Speaker note:** And here's what you get. Open WebUI — a full-featured chat interface — talking directly and only to your server. [Play Demo Video 2]

---

### Slide 11 — Demo 3: Dashboard
**Label:** Full control. Zero surprises.

**Content:**
- Section tag: "Demo — 3 of 3" (lavender)
- H2: "Full control. / Zero surprises." (lavender accents)
- Bullet list:
  - ● Manage all instances
  - ● Real-time Monitoring of Status
  - ● Budget Monitor with Auto-shutdown
  - ● Start, stop, Connect & Chat per VM
- **Video slot:** Multi-VM dashboard → budget monitor bar → stop a VM → cost drops

**Video guidance:** 20–25 sec · Highlight the real-time cost monitor bar · Multi-VM view

**Speaker note:** And this is the dashboard. Multiple VMs, live metrics, a budget monitor with auto-shutdown so you're never surprised by a cloud bill. Full control. [Play Demo Video 3]

---

### Slide 12 — Impact
**Label:** Who gets to use AI safely finally.

**Content:**
- Section tag: "Impact"
- H2: "Who gets to use / AI safely finally."
- 4-column sector grid:
  - ⚖️ **Legal** — Privileged documents, zero exposure
  - 🏥 **Healthcare** — GDPR-safe diagnostics, data stays in-network
  - 📰 **Journalism** — Query sources without leaving trails
  - 💻 **Engineering** — Code review with proprietary codebases
- Small presenter cam (bottom-right)

**Speaker note:** Think about who this unlocks. A law firm, a hospital, a journalist, an engineer — all making privacy-preserving AI accessible to everyone.

---

### Slide 13 — The Team
**Label:** Built by people who care about your privacy.

**Content:**
- Section tag: "The Team"
- H2: "Built by people / who care about / your privacy."
- Body: "We're builders frustrated by the trade-off between useful AI and private AI. So we built the bridge."
- Founder card: circular presenter cam placeholder + "Your Name / Founder & Lead Engineer"
- Add team member placeholder (dashed border with +)

**Speaker note:** We're a small team who got frustrated by this trade-off and decided to build the bridge. [Introduce yourself and any co-founders here.]

---

### Slide 14 — Closing
**Label:** Your data. Your models. Your conversations. Finally, actually private.

**Content:**
- Centered layout with grid background + triple glow blobs
- PrivateAI logo (64px)
- H1: "Your data. Your models. / Your conversations. / Finally, actually private."
- "Thank you."
- Contact pills: 🔗 privateai.app · 📧 hello@privateai.app · 🐦 @privateai

**Speaker note:** With PrivateAI... your data, your models, your conversations — safe, confidential, and finally, actually private. Thank you.

---

## Speaker Notes (Full)

> Press `N` during the presentation to show/hide speaker notes.

1. Welcome everyone. I'm [Your Name] and this is PrivateAI. Over the next 3 minutes I want to show you something that I think is genuinely overdue.

2. I want to start with a quick question. Raise your hand if you've used ChatGPT, Claude, or Gemini. Now — keep your hand up if you've had a conversation you wouldn't want shared with anyone. Medical advice. Legal questions. Client data. Something personal. Here's the thing... those conversations weren't private.

3. Right now, using AI means surrendering your privacy. Every prompt you send to ChatGPT or Claude becomes data that can be subpoenaed, leaked, or reviewed by employees. For doctors, lawyers, journalists, engineers handling trade secrets — this is a dealbreaker. Samsung employees leaked IP through ChatGPT. Hospitals ban AI entirely. Legal firms pay millions to avoid the risk.

4. But the alternative isn't much better. Setting up your own private AI means wrestling with cloud consoles, GPU drivers, SSH keys, and network security configs. It's days of work — and one mistake leaves your data exposed anyway. So teams are stuck: give up your privacy, or give up on AI entirely.

5. PrivateAI is the best of both worlds. One click to deploy your own fully private AI server — with hardware-level encryption — and one dashboard to manage it. No cloud expertise required. Your data never touches our servers. Your conversations stay yours.

6. Here's how it works. Four steps. Choose your cloud and GPU profile. Connect your credentials with one click — or just sign in via Microsoft OAuth. We handle everything: provisioning the VM, firewall, GPU drivers, pulling the AI models. Then you hit Connect and Chat — and you're talking to your own private AI.

7. Let me show you step one — the deployment wizard. Watch this: from zero to running in under 5 minutes. Real-time progress, 13 steps, WebSocket-driven so you see exactly what's happening. [Play Demo Video 1]

8. Sarah is one of thousands of professionals we're building for. A nurse in Western Sydney who knows AI could save her hours every day — but every tool she tries gets shut down by compliance. PrivateAI gives her a private server on her hospital's own Azure subscription. Patient data never leaves the network. Compliance is satisfied. Sarah gets her 2 hours back.

9. And here's what you get. Open WebUI — a full-featured chat interface — talking directly and only to your server. Your prompts are encrypted in transit. Nothing is logged on our end. Nothing goes to third parties. [Play Demo Video 2]

10. And this is the dashboard. Multiple VMs, live metrics, a budget monitor with auto-shutdown so you're never surprised by a cloud bill. Full control. [Play Demo Video 3]

11. Think about who this unlocks. A law firm that can now analyse privileged documents with AI. A hospital running AI diagnostics without violating patient privacy. A journalist querying sensitive sources without leaving a trail. An engineer reviewing proprietary code without risking trade secrets. We're making privacy-preserving AI accessible to everyone.

12. We're a small team who got frustrated by this trade-off and decided to build the bridge. [Introduce yourself and any co-founders here.]

13. With PrivateAI... your data, your models, your conversations — safe, confidential, and finally, actually private. Thank you.

14. With PrivateAI... your data, your models, your conversations — safe, confidential, and finally, actually private. Thank you.

---

## What You Need to Customise

| Item | Where | What to change |
|------|-------|----------------|
| Your name | `src/slides/Slide13.tsx` | Replace "Your Name" with your actual name |
| Your photo | `src/slides/Slide13.tsx` | Replace `PresenterCam` with a circular `<img>` |
| Presenter cam | Slides 01, 02, 03, 04, 06, 08, 12 | Drop in your circular, background-removed face |
| Demo Video 1 | `src/slides/Slide09.tsx` | Replace `videoId="dQw4w9WgXcQ"` with your YouTube ID |
| Demo Video 2 | `src/slides/Slide10.tsx` | Replace `videoId="dQw4w9WgXcQ"` with your YouTube ID |
| Demo Video 3 | `src/slides/Slide11.tsx` | Replace `videoId="dQw4w9WgXcQ"` with your YouTube ID |
| Contact links | `src/slides/Slide14.tsx` | Update privateai.app, hello@privateai.app, @privateai |

---

## Demo Video Specs

| Demo | Content | Recommended length |
|------|---------|-------------------|
| 1 — Deploy | Wizard → Azure credentials → H100 Confidential → live 13-step progress | 30–45 sec at 4× speed |
| 2 — Chat | Dashboard → Connect & Chat → Open WebUI → AI response → privacy badge | 20–30 sec, show privacy badge |
| 3 — Dashboard | Multi-VM view → budget monitor bar → stop VM → cost drops | 20–25 sec, highlight cost monitor |

All three video placeholders auto-play a YouTube embed on click. Replace the `videoId` prop with your actual recording's YouTube video ID.

---

## Project File Structure

```
PrivateAI_Presentation/
├── docker-compose.yml        # port 6173→5173, polling HMR
├── Dockerfile.dev            # node:current-alpine, npm install at build
├── index.html                # Outfit font, #root mount
├── package.json              # React 19, Vite 6, TypeScript
├── vite.config.ts            # host 0.0.0.0, port 5173
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx               # keyboard nav, speaker notes, scale logic
    ├── components.tsx        # GlowBlob, Logo, Pill, PresenterCam, DemoVideo, etc.
    ├── index.css             # design tokens, animations, layout
    └── slides/
        ├── index.ts          # SLIDES array (14 entries)
        ├── Slide01.tsx       # Title
        ├── Slide02.tsx       # Hook
        ├── Slide03.tsx       # Problem 1
        ├── Slide04.tsx       # Problem 2
        ├── Slide05.tsx       # Vision (new)
        ├── Slide06.tsx       # Solution
        ├── Slide07.tsx       # How It Works
        ├── Slide08.tsx       # User Story — Sarah (new)
        ├── Slide09.tsx       # Demo 1: Deploy
        ├── Slide10.tsx       # Demo 2: Chat
        ├── Slide11.tsx       # Demo 3: Dashboard
        ├── Slide12.tsx       # Impact
        ├── Slide13.tsx       # Team
        └── Slide14.tsx       # Closing
```
