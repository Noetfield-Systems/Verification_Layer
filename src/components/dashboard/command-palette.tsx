'use client'

/**
 * Noetfield command palette — Cmd+K (Mac) / Ctrl+K (Windows/Linux).
 *
 * Linear/Vercel-style. Three groups:
 *  - Navigate: jump to any dashboard view
 *  - Actions: verify sample, create API key, export audit, open docs
 *  - Help: keyboard shortcuts
 *
 * Fuzzy filter via simple substring match (no dependency on fuse.js).
 */

import * as React from 'react'
import { Command } from 'cmdk'
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
  ArrowRight,
  CornerDownLeft,
  Search,
  Command as CommandIcon,
} from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { ViewId } from '@/lib/dashboard-types'
import { toast } from '@/hooks/use-toast'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DialogTitle } from '@radix-ui/react-dialog'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon: typeof LayoutDashboard
  group: 'Navigate' | 'Actions' | 'Help'
  run: () => void
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const store = useDashboardStore()

  // Global hotkey: Cmd+K / Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      // Escape closes
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav = (view: ViewId) => {
    store.setActiveView(view)
    setOpen(false)
  }

  const items: PaletteItem[] = [
    // Navigate
    { id: 'nav-overview', label: 'Overview', hint: 'Dashboard home', icon: LayoutDashboard, group: 'Navigate', run: () => nav('overview') },
    { id: 'nav-verifications', label: 'Verifications', hint: 'List + filter', icon: ShieldCheck, group: 'Navigate', run: () => nav('verifications') },
    { id: 'nav-playground', label: 'Verify Playground', hint: 'Run a verification', icon: FlaskConical, group: 'Navigate', run: () => nav('playground') },
    { id: 'nav-keys', label: 'API Keys', hint: 'Manage keys', icon: KeyRound, group: 'Navigate', run: () => nav('keys') },
    { id: 'nav-projects', label: 'Projects', hint: 'Project list', icon: FolderKanban, group: 'Navigate', run: () => nav('projects') },
    { id: 'nav-audit', label: 'Audit Log', hint: 'Compliance export', icon: ScrollText, group: 'Navigate', run: () => nav('audit') },
    { id: 'nav-billing', label: 'Billing', hint: 'Cost tracking', icon: CreditCard, group: 'Navigate', run: () => nav('billing') },
    { id: 'nav-integrations', label: 'Integrations', hint: 'Bolt · v0 · Cursor · GitHub', icon: Plug, group: 'Navigate', run: () => nav('integrations') },
    { id: 'nav-docs', label: 'Docs', hint: 'API reference', icon: BookOpen, group: 'Navigate', run: () => nav('docs') },
    // Actions
    {
      id: 'act-verify-sample',
      label: 'Verify sample artifact',
      hint: 'Load a passing sample',
      icon: FlaskConical,
      group: 'Actions',
      run: () => {
        nav('playground')
        toast({ title: 'Sample loaded', description: 'Hit Verify in the playground to run the engine.' })
      },
    },
    {
      id: 'act-create-key',
      label: 'Create API key',
      hint: 'Mint a new nf_live_… key',
      icon: KeyRound,
      group: 'Actions',
      run: () => {
        nav('keys')
        toast({ title: 'Create a key', description: 'Click the Create Key button — the plaintext will be shown once.' })
      },
    },
    {
      id: 'act-export-audit',
      label: 'Export audit log',
      hint: 'CSV / JSON for compliance',
      icon: ScrollText,
      group: 'Actions',
      run: () => {
        nav('audit')
      },
    },
    {
      id: 'act-view-docs',
      label: 'View API docs',
      hint: 'G0–G7 reference',
      icon: BookOpen,
      group: 'Actions',
      run: () => nav('docs'),
    },
    // Help
    {
      id: 'help-shortcuts',
      label: 'Keyboard shortcuts',
      hint: 'Cmd+K opens this palette',
      icon: CommandIcon,
      group: 'Help',
      run: () => {
        toast({
          title: 'Keyboard shortcuts',
          description: 'Cmd/Ctrl+K — palette · Esc — close · Up/Down — navigate · Enter — select',
        })
      },
    },
  ]

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Noetfield command palette"
      className="fixed left-1/2 top-[20%] z-[100] w-full max-w-xl -translate-x-1/2"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-emerald-950/40 backdrop-blur-xl">
        {/* Accessible title — Radix Dialog requires a DialogTitle for screen readers.
            VisuallyHidden keeps it off-screen but available to AT. */}
        <VisuallyHidden>
          <DialogTitle>Noetfield command palette</DialogTitle>
        </VisuallyHidden>
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="noetfield-mono rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        {/* Results */}
        <Command.List className="max-h-[400px] overflow-y-auto p-2 noetfield-scroll">
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>
          {(['Navigate', 'Actions', 'Help'] as const).map((group) => {
            const groupItems = items.filter((i) => i.group === group)
            if (groupItems.length === 0) return null
            return (
              <Command.Group key={group} heading={group} className="text-muted-foreground">
                {groupItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.hint ?? ''}`}
                      onSelect={() => item.run()}
                      className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground outline-none data-[selected=true]:bg-emerald-500/10 data-[selected=true]:text-emerald-400"
                    >
                      <Icon className="size-4 text-muted-foreground group-data-[selected=true]:text-emerald-400" />
                      <span className="flex-1">{item.label}</span>
                      {item.hint && (
                        <span className="text-xs text-muted-foreground">{item.hint}</span>
                      )}
                      <CornerDownLeft className="size-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )
          })}
        </Command.List>
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="noetfield-mono rounded border border-border bg-card px-1 py-0.5">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="noetfield-mono rounded border border-border bg-card px-1 py-0.5">↵</kbd>
              select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="font-medium text-foreground">Noetfield Engine</span>
            <ArrowRight className="size-3" />
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}
