'use client'

/**
 * GateResult — a single G0-G7 gate row used by both the Verification Detail
 * and the Verify Playground result panels.
 *
 * Layout: status dot | name | detail text | (expandable) evidence
 * The evidence array is shown inside a mono <pre> when the user expands
 * the row. Compact variant is used in the playground (no expand UI).
 */

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GateResult as GateResultT } from '@/lib/dashboard-types'

interface Props {
  gate: GateResultT
  /** Compact mode: hide the expand chevron, show evidence inline if present. */
  compact?: boolean
}

export function GateResult({ gate, compact = false }: Props) {
  const [open, setOpen] = React.useState(false)
  const hasEvidence = Array.isArray(gate.evidence) && gate.evidence.length > 0

  return (
    <div
      className={cn(
        'border-b border-border last:border-b-0',
        compact ? 'py-2' : 'py-3',
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3',
          hasEvidence && !compact && 'cursor-pointer',
        )}
        onClick={() => hasEvidence && !compact && setOpen((v) => !v)}
      >
        <GateStatusDot passed={gate.passed} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{gate.name}</span>
            {!compact && hasEvidence && (
              <ChevronRight
                className={cn(
                  'size-3.5 text-muted-foreground transition-transform',
                  open && 'rotate-90',
                )}
              />
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{gate.detail}</div>
          {compact && hasEvidence && (
            <pre className="noetfield-scroll noetfield-mono mt-1 max-h-32 overflow-auto rounded-md border border-border bg-secondary/40 p-2 text-[11px] leading-relaxed">
              {gate.evidence!.join('\n')}
            </pre>
          )}
        </div>
      </div>
      {!compact && hasEvidence && open && (
        <pre className="noetfield-scroll noetfield-mono mt-2 ml-7 max-h-48 overflow-auto rounded-md border border-border bg-secondary/40 p-2 text-[11px] leading-relaxed">
          {gate.evidence!.join('\n')}
        </pre>
      )}
    </div>
  )
}

export function GateStatusDot({ passed }: { passed: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        passed ? 'bg-emerald-500' : 'bg-red-500',
      )}
      aria-label={passed ? 'passed' : 'failed'}
    />
  )
}
