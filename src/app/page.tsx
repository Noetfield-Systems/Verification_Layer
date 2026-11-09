'use client'

/**
 * Noetfield — single-page application shell.
 *
 * Default view: the marketing landing page. A "Launch Dashboard" CTA flips
 * `enteredDashboard` to true and renders the dashboard shell (sidebar + topbar
 * + active view). The command palette (⌘K) is mounted globally in both modes.
 *
 * Demo data is never seeded by public visitors.
 *
 * The sandbox only exposes `/` to the user, so the entire app is rendered
 * here as client-side state. framer-motion AnimatePresence cross-fades view
 * transitions (opacity + subtle y-translate).
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useDashboardStore } from '@/lib/dashboard-store'
import { Providers } from '@/components/dashboard/providers'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { CommandPalette } from '@/components/dashboard/command-palette'
import { LandingView } from '@/components/dashboard/landing'
import { OverviewView } from '@/components/dashboard/overview'
import { VerificationsView } from '@/components/dashboard/verifications'
import { VerificationDetailView } from '@/components/dashboard/verification-detail'
import { VerifyPlaygroundView } from '@/components/dashboard/verify-playground'
import { ApiKeysView } from '@/components/dashboard/api-keys'
import { ProjectsView } from '@/components/dashboard/projects'
import { AuditLogView } from '@/components/dashboard/audit-log'
import { BillingView } from '@/components/dashboard/billing'
import { IntegrationsView } from '@/components/dashboard/integrations'
import { DocsView } from '@/components/dashboard/docs'

export default function Home() {
  return (
    <Providers>
      <CommandPalette />
      <AppShell />
    </Providers>
  )
}

function AppShell() {
  const enteredDashboard = useDashboardStore((s) => s.enteredDashboard)
  const activeView = useDashboardStore((s) => s.activeView)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  // If we're on the landing page (or haven't entered the dashboard), show
  // the marketing site full-bleed. The dashboard shell renders otherwise.
  if (!enteredDashboard || activeView === 'landing') {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <LandingView />
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-sidebar md:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar (Sheet drawer) */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 border-r border-border p-0">
          <Sidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ActiveView view={activeView} />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

function ActiveView({ view }: { view: string }) {
  switch (view) {
    case 'overview':
      return <OverviewView />
    case 'verifications':
      return <VerificationsView />
    case 'detail':
      return <VerificationDetailView />
    case 'playground':
      return <VerifyPlaygroundView />
    case 'keys':
      return <ApiKeysView />
    case 'projects':
      return <ProjectsView />
    case 'audit':
      return <AuditLogView />
    case 'billing':
      return <BillingView />
    case 'integrations':
      return <IntegrationsView />
    case 'docs':
      return <DocsView />
    default:
      return <OverviewView />
  }
}
