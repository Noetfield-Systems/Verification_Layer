'use client'

/**
 * StatCard — a single KPI tile for the Overview / Billing views.
 *
 * Visual: subtle dark card with a label, large value, optional sublabel
 * and optional icon. No gradients, no playful illustrations.
 */

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: React.ReactNode
  sublabel?: React.ReactNode
  icon?: LucideIcon
  /** Accent color override for the icon. Defaults to muted. */
  accent?: 'emerald' | 'red' | 'muted'
  className?: string
}

export function StatCard({ label, value, sublabel, icon: Icon, accent = 'muted', className }: Props) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-500'
      : accent === 'red'
        ? 'text-red-500'
        : 'text-muted-foreground'
  return (
    <Card className={cn('py-5', className)}>
      <CardContent className="px-5">
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {Icon && <Icon className={cn('size-4', accentClass)} />}
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {sublabel && (
          <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  )
}
