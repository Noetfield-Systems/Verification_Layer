'use client'

/**
 * DataTableShell — a wrapper that gives a table the standard Noetfield
 * card-style frame with horizontal scroll on small screens and the
 * `.noetfield-scroll` thin scrollbar.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
}

export function DataTableShell({ children, className }: Props) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-border bg-card',
        'noetfield-scroll',
        className,
      )}
    >
      <div className="min-w-full">{children}</div>
    </div>
  )
}
