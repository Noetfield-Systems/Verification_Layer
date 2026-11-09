'use client'

/**
 * VerdictBadge — render the PASS / FAIL / PENDING verdict with the
 * exact Noetfield aesthetic. Uses the `.nf-pass-bg` / `.nf-fail-bg`
 * CSS helpers from globals.css for the badge background, and the
 * `.nf-pass` / `.nf-fail` helpers for the text color.
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react'
import type { Verdict } from '@/lib/dashboard-types'

interface Props {
  verdict: Verdict
  size?: 'sm' | 'lg'
  className?: string
}

export function VerdictBadge({ verdict, size = 'sm', className }: Props) {
  if (!verdict) {
    return (
      <Badge
        variant="outline"
        className={cn('gap-1 text-muted-foreground', size === 'lg' && 'px-3 py-1 text-sm', className)}
      >
        <Loader2 className="size-3 animate-spin" /> PENDING
      </Badge>
    )
  }
  if (verdict === 'pass') {
    return (
      <Badge
        variant="outline"
        className={cn(
          'nf-pass-bg nf-pass border-transparent gap-1 font-semibold uppercase tracking-wide',
          size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]',
          className,
        )}
      >
        <ShieldCheck className={size === 'lg' ? 'size-3.5' : 'size-3'} /> PASS
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        'nf-fail-bg nf-fail border-transparent gap-1 font-semibold uppercase tracking-wide',
        size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]',
        className,
      )}
    >
      <ShieldX className={size === 'lg' ? 'size-3.5' : 'size-3'} /> FAIL
    </Badge>
  )
}
