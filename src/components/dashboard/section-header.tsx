'use client'

/**
 * SectionHeader — the standard page header at the top of each dashboard
 * view: title, optional description, optional right-side action slot.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, description, actions, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
