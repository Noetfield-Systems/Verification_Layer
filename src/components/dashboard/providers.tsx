'use client'

/**
 * Wraps the dashboard in a TanStack Query QueryClient + Radix Tooltip provider.
 * The QueryClient is created once per browser session via React.useState
 * (so it survives re-renders but is fresh per SSR-safe mount).
 */

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The dashboard is a live-ish monitoring surface, but we don't
            // want to hammer the sandbox. 30s for list-y queries, no retry
            // storms.
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
