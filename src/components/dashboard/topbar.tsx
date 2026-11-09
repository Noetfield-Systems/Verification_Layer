'use client'

/**
 * Topbar — the sticky top bar of the dashboard shell.
 *
 * Premium upgrades:
 *  - Glassmorphic backdrop-blur with stronger transparency
 *  - Breadcrumb (Dashboard / section name)
 *  - "⌘K" hint button that opens the command palette
 *  - Refined account chip with subtle emerald accent
 */

import * as React from 'react'
import { Menu, Github, Command, ChevronRight, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { ViewId } from '@/lib/dashboard-types'
import { Logo } from './logo'
import { cn } from '@/lib/utils'

const VIEW_LABELS: Record<ViewId, string> = {
  landing: 'Landing',
  overview: 'Overview',
  verifications: 'Verifications',
  detail: 'Verification Detail',
  playground: 'Verify Playground',
  keys: 'API Keys',
  projects: 'Projects',
  audit: 'Audit Log',
  billing: 'Billing',
  integrations: 'Integrations',
  docs: 'Docs',
}

interface Props {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: Props) {
  const activeView = useDashboardStore((s) => s.activeView)
  const label = VIEW_LABELS[activeView] ?? 'Dashboard'

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 px-4 backdrop-blur-xl',
        'bg-background/70 supports-[backdrop-filter]:bg-background/60',
      )}
    >
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>

      {/* Mobile wordmark */}
      <div className="flex items-center gap-2 md:hidden">
        <Logo className="size-5" />
        <span className="text-sm font-semibold tracking-tight">Noetfield</span>
      </div>

      {/* Breadcrumb */}
      <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
        <span className="text-muted-foreground/70">Dashboard</span>
        <ChevronRight className="size-3.5 text-muted-foreground/50" />
        <span className="font-medium text-foreground">{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* ⌘K hint button — opens the command palette */}
        <button
          onClick={openPalette}
          className="hidden items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:flex"
          aria-label="Open command palette"
          title="Open command palette (⌘K)"
        >
          <Command className="size-3" />
          <span>K</span>
        </button>

        <a
          href="https://github.com/Noetfield-Systems/Noetfield"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="GitHub repository"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Github className="size-4" />
        </a>

        <AccountChip />
      </div>
    </header>
  )
}

function AccountChip() {
  const signOut = useDashboardStore((s) => s.signOut)
  const projectId = useDashboardStore((s) => s.signedUpProjectId)
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5" title="Authenticated project">
        <div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-[10px] font-semibold text-emerald-950">N</div>
        <div className="hidden text-xs leading-tight sm:block">
          <div className="font-medium">Your workspace</div>
          <div className="text-[10px] text-muted-foreground">{projectId ? `Project ${projectId.slice(-8)}` : 'Authenticated'}</div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out and clear local credentials" title="Sign out"><LogOut className="size-4" /></Button>
    </div>
  )
}
