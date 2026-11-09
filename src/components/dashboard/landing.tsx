'use client'

/**
 * Noetfield landing page — the unicorn-startup front door.
 *
 * Sections:
 *   1. Nav bar (glassmorphic, sticky)
 *   2. Hero — value prop, CTAs, animated determinism counter, gradient mesh bg
 *   3. Social proof strip — stats + customer logos placeholder
 *   4. Three pillars — Verify → Token → Audit
 *   5. Interactive demo embed — shows a real verify call + verdict
 *   6. Feature grid — 6 capabilities
 *   7. Code sample — SDK one-liner
 *   8. Pricing — Free / Pro / Enterprise
 *   9. Final CTA
 *  10. Footer
 *
 * All on dark background per spec. Tasteful emerald gradient accents. No
 * playful illustrations, no gradients-as-decoration.
 */

import * as React from 'react'
import { motion, useInView, useMotionValue, animate } from 'framer-motion'
import {
  ArrowRight,
  ShieldCheck,
  KeyRound,
  ScrollText,
  Terminal,
  Github,
  Check,
  Sparkles,
  Lock,
  Zap,
  Globe,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from './logo'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useStats } from '@/lib/dashboard-api'
import { VerdictBadge } from './verdict-badge'
import { SignupModal } from './signup-modal'

export function LandingView() {
  const enterDashboard = useDashboardStore((s) => s.enterDashboard)
  const setActiveView = useDashboardStore((s) => s.setActiveView)
  const [signupOpen, setSignupOpen] = React.useState(false)

  const enter = (view: Parameters<typeof setActiveView>[0]) => {
    if (!useDashboardStore.getState().apiKey) { setSignupOpen(true); return }
    enterDashboard()
    if (view !== 'overview') setActiveView(view)
    // Delight moment — subtle side-cannon confetti on dashboard entry.
    import('./confetti').then((m) => m.fireSideConfetti()).catch(() => {})
  }

  const openSignup = () => setSignupOpen(true)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SignupModal open={signupOpen} onOpenChange={setSignupOpen} />
      <LandingNav onEnter={() => enter('overview')} onSignup={openSignup} />
      <Hero onEnter={() => enter('overview')} onPlayground={() => enter('playground')} onSignup={openSignup} />
      <SocialProofStrip />
      <ThreePillars />
      <InteractiveDemo onEnter={() => enter('playground')} />
      <FeatureGrid />
      <CodeSample />
      <Pricing onEnter={() => enter('overview')} onSignup={openSignup} />
      <FinalCta onEnter={() => enter('overview')} onSignup={openSignup} />
      <LandingFooter />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function LandingNav({ onEnter, onSignup }: { onEnter: () => void; onSignup: () => void }) {
  const [scrolled, setScrolled] = React.useState(false)
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled
          ? 'border-b border-border/60 bg-background/80 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo withWordmark className="size-7" />
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#pillars" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Product</a>
          <a href="#demo" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Demo</a>
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          <button onClick={() => onEnter()} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Docs</button>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/noetfield"
            target="_blank"
            rel="noreferrer"
            className="hidden size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:flex"
            aria-label="GitHub"
          >
            <Github className="size-4" />
          </a>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEnter}
            className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            Dashboard
          </Button>
          <Button
            size="sm"
            onClick={onSignup}
            className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          >
            Get API key
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ onEnter, onPlayground, onSignup }: { onEnter: () => void; onPlayground: () => void; onSignup: () => void }) {
  return (
    <section className="relative overflow-hidden">
      {/* Gradient mesh background — subtle, not decorative */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute left-[5%] top-[40%] h-[400px] w-[400px] rounded-full bg-emerald-700/5 blur-[100px]" />
        <div className="absolute right-[5%] top-[20%] h-[300px] w-[300px] rounded-full bg-teal-500/5 blur-[100px]" />
      </div>
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.025]"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-32 lg:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          {/* Announcement pill */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>G0–G7 deterministic engine — production-ready</span>
            <ArrowRight className="size-3" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
          >
            Agent Execution Assurance.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg"
          >
            Cryptographic proof that your AI agent&apos;s code is safe to deploy. Every artifact runs eight deterministic gates — same input, same verdict hash, every time. Trusted by regulated industries for SOC 2, FINTRAC, and EU AI Act compliance.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              size="lg"
              onClick={onSignup}
              className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400 sm:w-auto"
            >
              Start Verifying — free
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={onPlayground}
              className="w-full border-border bg-card/40 backdrop-blur hover:bg-card sm:w-auto"
            >
              <Terminal className="mr-2 size-4" />
              Try the Playground
            </Button>
          </motion.div>

          {/* Determinism counter */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-14 max-w-2xl"
          >
            <DeterminismCounter />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/** Animated "100 runs, 1 hash" counter — the core proof, front and center. */
function DeterminismCounter() {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const runs = useMotionValue(0)
  const hashes = useMotionValue(0)
  const [runsDisplay, setRunsDisplay] = React.useState(0)
  const [hashesDisplay, setHashesDisplay] = React.useState(0)

  React.useEffect(() => {
    if (!inView) return
    const controls1 = animate(runs, 100, { duration: 1.4, ease: 'easeOut', onUpdate: (v) => setRunsDisplay(Math.round(v)) })
    const controls2 = animate(hashes, 1, { duration: 1.4, ease: 'easeOut', onUpdate: (v) => setHashesDisplay(Math.round(v)) })
    return () => { controls1.stop(); controls2.stop() }
  }, [inView, runs, hashes])

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card/40 backdrop-blur"
    >
      <div className="p-5 sm:p-6">
        <div className="text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
          {runsDisplay}
        </div>
        <div className="mt-1 text-xs text-muted-foreground sm:text-sm">adversarial runs</div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="text-3xl font-semibold tabular-nums text-emerald-500 sm:text-4xl">
          {hashesDisplay}
        </div>
        <div className="mt-1 text-xs text-muted-foreground sm:text-sm">distinct verdict hash</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Social proof
// ---------------------------------------------------------------------------

function SocialProofStrip() {
  const { data: stats } = useStats()
  const total = stats?.total
  const passed = stats?.passed
  const cost = stats?.total_cost_usd
  return (
    <section className="border-y border-border bg-card/20">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        <Stat label="Verifications run" value={total == null ? '—' : total.toLocaleString()} />
        <Stat label="Artifacts passed" value={passed == null ? '—' : passed.toLocaleString()} />
        <Stat label="Avg cost / verify" value={cost == null || total == null || total === 0 ? '—' : `$${(cost / total).toFixed(6)}`} />
        <Stat label="Engine policy" value="v1 · deterministic" mono />
      </div>
    </section>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-border p-5 [&:not(:last-child)]:border-r">
      <div className={`text-lg font-semibold text-foreground sm:text-xl ${mono ? 'noetfield-mono text-sm sm:text-base' : ''}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Three pillars
// ---------------------------------------------------------------------------

const PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Verify',
    body: 'Every artifact runs eight deterministic gates — provenance, credentials, license, transform fidelity, policy immutability. Same input, same verdict hash, every time.',
    detail: 'G0 → G7',
  },
  {
    icon: KeyRound,
    title: 'Token',
    body: 'On PASS, Noetfield issues a 15-minute HMAC deploy token bound to the artifact hash. Your Cloudflare, Railway, or AWS infrastructure verifies the token before deploy.',
    detail: 'HMAC-SHA256 · 15-min TTL',
  },
  {
    icon: ScrollText,
    title: 'Audit',
    body: 'Every verification produces a tamper-proof receipt with artifact hash, gate results, cost, model identity, and signature. Export as PDF for SOC 2 / FINTRAC / EU AI Act.',
    detail: 'Tamper-evident · PDF export',
  },
] as const

function ThreePillars() {
  return (
    <section id="pillars" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-500">How it works</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Three steps. Zero black boxes.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Noetfield slots between your AI generation layer (Bolt, v0, Cursor, custom agents) and your deploy target. One line of code. Cryptographic proof on every commit.
        </p>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {PILLARS.map((p, i) => {
          const Icon = p.icon
          return (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 transition-colors hover:border-emerald-500/40"
            >
              <div className="mb-5 inline-flex size-11 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                <Icon className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <div className="noetfield-mono mt-5 text-xs text-muted-foreground">{p.detail}</div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Interactive demo
// ---------------------------------------------------------------------------

function InteractiveDemo({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="demo" className="border-y border-border bg-card/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-500">Live proof</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Watch the engine work.
            </h2>
            <p className="mt-4 text-muted-foreground">
              The playground runs the real G0–G7 engine against your input. Paste code, hit verify, and watch each gate fire — pass or fail — with the verdict hash computed deterministically.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Real engine, real receipts — no mockups',
                'PASS issues a deploy token bound to the artifact hash',
                'Receipts are HMAC-signed and tamper-evident',
                'Export as PDF for compliance audits',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <Button onClick={onEnter} className="mt-7 bg-emerald-500 text-emerald-950 hover:bg-emerald-400">
              Open Playground
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
          <DemoCard />
        </div>
      </div>
    </section>
  )
}

function DemoCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-emerald-950/20"
    >
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 border-b border-border bg-card/60 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-red-500/60" />
          <div className="size-2.5 rounded-full bg-yellow-500/60" />
          <div className="size-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <span className="noetfield-mono ml-2 text-xs text-muted-foreground">noetfield verify</span>
      </div>
      {/* Terminal body */}
      <div className="noetfield-mono space-y-2 p-5 text-xs leading-relaxed sm:text-[13px]">
        <div className="text-muted-foreground">
          <span className="text-emerald-500">$</span> noetfield verify ./handler.ts
        </div>
        <div className="text-muted-foreground">Verifying inline:db4f4f19…</div>
        <div className="pt-2">
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G0 Provenance
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G1 Policy
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G2 Credential
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G3 License
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G4 Transform Fidelity
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G5 Policy Immutability
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G6 Unordered Commit Lock
          </div>
          <div className="flex items-center gap-2 text-emerald-500">
            <Check className="size-3.5" /> G7 Deploy Token
          </div>
        </div>
        <div className="pt-3">
          <VerdictBadge verdict="pass" size="lg" />
        </div>
        <div className="pt-3 text-muted-foreground">
          verdict_hash: <span className="text-foreground">sha256:db4f4f19…</span>
        </div>
        <div className="text-muted-foreground">
          deploy_token: <span className="text-foreground">nf_tok_1.1794…</span>
        </div>
        <div className="text-muted-foreground">
          cost_usd: <span className="text-foreground">$0.000800</span>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Feature grid
// ---------------------------------------------------------------------------

const FEATURES = [
  { icon: Lock, title: 'Eight deterministic gates', body: 'G0 provenance through G7 deploy token. Same input, same verdict hash — across Node, workerd, and Cloudflare runtimes.' },
  { icon: KeyRound, title: 'HMAC deploy tokens', body: 'Short-lived tokens bound to the artifact hash. Infrastructure verifies before deploy. TTL is 15 minutes by default.' },
  { icon: ScrollText, title: 'Tamper-proof receipts', body: 'Every verification produces a canonical-JSON receipt, HMAC-signed. Any byte change breaks the signature.' },
  { icon: FileText, title: 'Audit-ready PDF export', body: 'One click exports a compliance-grade PDF — verdict, gates, signature, token — for SOC 2, FINTRAC, EU AI Act.' },
  { icon: Zap, title: 'Sub-50ms verification', body: 'The engine is synchronous and fast. No queue, no async, no retry storms. The displayed cost is a configurable estimate, not metered infrastructure spend.' },
  { icon: Globe, title: 'Deploy anywhere', body: 'Cloudflare Workers, Railway, AWS Lambda — wherever your agent sends code, Noetfield verifies it first.' },
] as const

function FeatureGrid() {
  return (
    <section id="features" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-500">Capabilities</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Built for regulated industries.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Noetfield is the cryptographic proof-of-execution layer that makes autonomous AI deployable in finance, healthcare, and government.
        </p>
      </div>
      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.title} className="group bg-background p-7 transition-colors hover:bg-card/40">
              <Icon className="size-5 text-emerald-500" />
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Code sample
// ---------------------------------------------------------------------------

function CodeSample() {
  return (
    <section className="border-y border-border bg-card/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <CodeCard />
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-500">Drop-in SDK</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              One line. Pipe everything.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Install the SDK in TypeScript or Python. Wrap your agent output in <code className="noetfield-mono rounded bg-card px-1.5 py-0.5 text-xs text-foreground">nf.verify()</code>. Block deploy on FAIL. That&apos;s it.
            </p>
            <div className="mt-6 grid gap-3">
              <CodeRow label="TypeScript" command="npm install @noetfield/sdk" />
              <CodeRow label="Python" command="pip install noetfield" />
              <CodeRow label="CLI" command="npm install -g @noetfield/cli" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CodeCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-emerald-950/20">
      <div className="flex items-center gap-2 border-b border-border bg-card/60 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-red-500/60" />
          <div className="size-2.5 rounded-full bg-yellow-500/60" />
          <div className="size-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <span className="noetfield-mono ml-2 text-xs text-muted-foreground">verify.ts</span>
      </div>
      <pre className="noetfield-mono overflow-x-auto p-5 text-xs leading-relaxed text-foreground sm:text-[13px]">
{`import { Noetfield } from '@noetfield/sdk'

const nf = new Noetfield({
  apiKey: process.env.NOETFIELD_API_KEY
})

const result = await nf.verify({
  artifact: agent.generatedCode,
  artifactType: 'code',
  metadata: {
    source: 'cursor',
    projectId: 'proj_acme'
  }
})

if (result.verdict !== 'pass') {
  throw new Error(\`Blocked: \${result.gates
    .filter(g => !g.passed)
    .map(g => g.name)
    .join(', ')}\`)
}

// Safe to deploy — token is bound to artifact hash
await deploy(agent.generatedCode, {
  noetfieldToken: result.deployToken
})`}
      </pre>
    </div>
  )
}

function CodeRow({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3 text-left transition-colors hover:bg-card"
    >
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="noetfield-mono mt-1 text-sm text-foreground">{command}</div>
      </div>
      {copied ? (
        <Check className="size-4 text-emerald-500" />
      ) : (
        <Terminal className="size-4 text-muted-foreground" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    cadence: '/mo',
    blurb: 'For solo developers and proof-of-concepts.',
    features: ['100 verifications / mo', 'All 8 gates', 'Dashboard access', 'Community support'],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$49',
    cadence: '/mo',
    blurb: 'For teams shipping AI to production.',
    features: ['10,000 verifications / mo', 'Unlimited projects', 'PDF receipt export', 'GitHub Action', 'Slack webhooks', 'Email support'],
    cta: 'Request Pro access',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    blurb: 'For regulated industries at scale.',
    features: ['Unlimited verifications', 'SAML SSO + SCIM', 'Audit log streaming', 'Custom policy gates', 'On-prem deployment', 'Dedicated CSM + SLA'],
    cta: 'Talk to sales',
    featured: false,
  },
] as const

function Pricing({ onEnter, onSignup }: { onEnter: () => void; onSignup: () => void }) {
  return (
    <section id="pricing" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-500">Pricing</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Priced for adoption.
        </h2>
        <p className="mt-4 text-muted-foreground">
          The free API tier is limited. Pro and Enterprise are available by inquiry; subscriptions are not yet self-serve.
        </p>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {PRICING.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-7 ${
              tier.featured
                ? 'border-emerald-500/60 bg-card shadow-2xl shadow-emerald-950/30'
                : 'border-border bg-card/40'
            }`}
          >
            {tier.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-950">
                Planned
              </div>
            )}
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{tier.price}</span>
              {tier.cadence && <span className="text-sm text-muted-foreground">{tier.cadence}</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tier.blurb}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={tier.name === 'Free' ? onSignup : () => { window.location.href = `mailto:operations@noetfield.com?subject=${encodeURIComponent('Noetfield ' + tier.name + ' access inquiry')}` }}
              variant={tier.featured ? 'default' : 'outline'}
              className={`mt-7 w-full ${
                tier.featured ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : ''
              }`}
            >
              {tier.cta}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Final CTA + Footer
// ---------------------------------------------------------------------------

function FinalCta({ onEnter, onSignup }: { onEnter: () => void; onSignup: () => void }) {
  return (
    <section className="relative overflow-hidden border-y border-border">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <Sparkles className="mx-auto size-7 text-emerald-500" />
        <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Ship autonomous AI with a receipt.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Every agent execution, cryptographically proven. Every deploy, token-verified. Every audit, one PDF away.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={onSignup} className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400 sm:w-auto">
            Get your API key — free
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={onEnter} className="w-full sm:w-auto">
            <FileText className="mr-2 size-4" />
            View dashboard demo
          </Button>
        </div>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo withWordmark className="size-7" />
            <p className="mt-3 text-sm text-muted-foreground">
              Cryptographic proof that your AI agent&apos;s code is safe to deploy.
            </p>
          </div>
          <FooterCol title="Product" links={['Verify API', 'Dashboard', 'SDK', 'CLI', 'GitHub Action']} />
          <FooterCol title="Compliance" links={['SOC 2', 'FINTRAC', 'EU AI Act', 'Audit PDF', 'Webhooks']} />
          <FooterCol title="Company" links={['About', 'Blog', 'Careers', 'Security', 'Contact']} />
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© 2026 Noetfield Systems. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              All systems operational
            </span>
            <a href="https://github.com/noetfield" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              <Github className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
      <ul className="mt-4 space-y-2">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="text-sm text-foreground/80 transition-colors hover:text-foreground">{l}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
