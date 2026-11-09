'use client'

/**
 * EmptyState — a centered, iconified empty placeholder used inside cards
 * and tables when there is no data yet.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      <div className="rounded-full border border-border bg-secondary/50 p-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="mt-4 text-sm font-medium">{title}</div>
      {description && (
        <div className="mt-1 max-w-md text-xs text-muted-foreground">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
