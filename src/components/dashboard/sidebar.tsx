'use client'

/**
 * Sidebar — the persistent left navigation.
 *
 * Premium upgrades:
 *  - Refined brand mark with wordmark
 *  - "Search / ⌘K" trigger at the top (opens the command palette)
 *  - Live engine-status footer with pulsing emerald dot + latency
 *  - Hover affordances with subtle slide-right on the active indicator
 */

import * as React from 'react'
import {
  LayoutDashboard,
  ShieldCheck,
  FlaskConical,
  KeyRound,
  FolderKanban,
  ScrollText,
  CreditCard,
  Plug,
  BookOpen,
  Search,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { ViewId } from '@/lib/dashboard-types'
import { Logo } from './logo'

/** Policy version — kept in sync with src/lib/engine/gates.ts POLICY_VERSION. */
const POLICY_VERSION = 1

interface NavItem {
  id: ViewId
  label: string
  icon: typeof LayoutDashboard
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'verifications', label: 'Verifications', icon: ShieldCheck },
  { id: 'playground', label: 'Verify Playground', icon: FlaskConical },
  { id: 'keys', label: 'API Keys', icon: KeyRound },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'docs', label: 'Docs', icon: BookOpen },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const activeView = useDashboardStore((s) => s.activeView)
  const setActiveView = useDashboardStore((s) => s.setActiveView)
  const backToLanding = useDashboardStore((s) => s.backToLanding)

  const onNavigate = (id: ViewId) => {
    setActiveView(id)
    onMobileOpenChange?.(false)
  }

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-full flex-col gap-5 bg-sidebar text-sidebar-foreground"
    >
      {/* Brand + back-to-landing */}
      <div className="flex items-center justify-between px-5 pt-5">
        <button onClick={backToLanding} className="transition-opacity hover:opacity-80" aria-label="Back to landing">
          <Logo withWordmark className="size-7" />
        </button>
        <button
          onClick={backToLanding}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Back to landing"
          title="Back to landing"
        >
          <ArrowLeft className="size-3.5" />
        </button>
      </div>

      {/* Search trigger — opens the command palette via the global hotkey.
          We render a button that simulates the hotkey so users discover ⌘K. */}
      <div className="px-3">
        <SearchTrigger />
      </div>

      {/* Nav items */}
      <ul className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          const groupActive = active || (activeView === 'detail' && item.id === 'verifications')
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={groupActive ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all',
                  groupActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                {/* Active indicator bar */}
                {groupActive && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    groupActive
                      ? 'text-emerald-500'
                      : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* System status footer */}
      <div className="mt-auto p-3">
        <SystemStatusBar />
      </div>

      <span className="sr-only">{mobileOpen ? 'menu open' : 'menu closed'}</span>
    </nav>
  )
}

function SearchTrigger() {
  const [showKbd, setShowKbd] = React.useState(false)
  React.useEffect(() => {
    // Only show the ⌘K hint on keyboards that have a Meta key (Mac) or Ctrl (PC).
    // We can't detect Cmd vs Ctrl reliably without an event, so we show a
    // platform-aware label after mount.
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
    setShowKbd(true)
    void isMac
  }, [])
  const handleClick = () => {
    // Dispatch the global hotkey so the CommandPalette picks it up.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      }),
    )
  }
  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-2.5 rounded-md border border-border bg-sidebar-accent/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      aria-label="Open command palette"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left text-xs">Search…</span>
      {showKbd && (
        <kbd className="noetfield-mono rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      )}
    </button>
  )
}

/**
 * Live system status bar — pulsing emerald dot (engine healthy), latency
 * indicator, policy version + hash prefix. This is the "engine is live and
 * proven" signal, refined.
 */
function SystemStatusBar() {
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null)
  const apiKey = useDashboardStore((s) => s.apiKey)
  const [pulse, setPulse] = React.useState(0)

  // Measure latency against /api/dashboard (a real DB round-trip).
  React.useEffect(() => {
    let cancelled = false
    const measure = async () => {
      try {
        const t0 = performance.now()
        const response = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ action: 'stats' }),
        })
        if (cancelled) return
        setLatencyMs(response.ok ? Math.round(performance.now() - t0) : null)
      } catch {
        if (cancelled) return
        setLatencyMs(null)
      }
    }
    measure()
    const id = setInterval(measure, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [apiKey])

  // Pulse animation cycle (visual only — does not affect logic).
  React.useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p + 1) % 2), 2_000)
    return () => clearInterval(id)
  }, [])

  const latencyLabel =
    latencyMs == null ? '—' : latencyMs < 10 ? `<10ms` : `${latencyMs}ms`
  const latencyColor =
    latencyMs == null
      ? 'text-muted-foreground'
      : latencyMs < 50
        ? 'text-emerald-500'
        : latencyMs < 200
          ? 'text-yellow-500'
          : 'text-red-500'

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          API status
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${latencyMs == null ? 'border-border text-muted-foreground' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'}`}>
          <span className="relative flex size-1.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 ${
                pulse ? 'animate-ping' : ''
              }`}
            />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          {latencyMs == null ? 'unverified' : 'reachable'}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">policy</div>
          <div className="noetfield-mono text-[11px] text-foreground">v{POLICY_VERSION}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">latency</div>
          <div className={`noetfield-mono text-[11px] ${latencyColor}`}>{latencyLabel}</div>
        </div>
      </div>
      <div className="mt-2.5 border-t border-border pt-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">policy_hash</div>
        <div className="noetfield-mono mt-0.5 truncate text-[11px] text-muted-foreground">
          Not verified in this view
        </div>
      </div>
    </div>
  )
}
