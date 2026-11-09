'use client'

/**
 * CopyableHash — a mono-styled hash/token with a copy-to-clipboard button.
 *
 * - Uses the `.noetfield-mono` class for JetBrains Mono rendering.
 * - Truncates long strings to `truncate` chars + an ellipsis.
 * - Copy button appears subtly and brightens on hover.
 * - Shows a toast on copy via the global useToast hook.
 */

import * as React from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { toast as toastFn } from '@/hooks/use-toast'

interface Props {
  value: string | null | undefined
  truncate?: number
  className?: string
  /** Show the full value instead of the truncated form (still copy the full). */
  full?: boolean
  /** Hide the copy button entirely (e.g. for read-only displays). */
  hideCopy?: boolean
  label?: string
}

export function CopyableHash({
  value,
  truncate = 24,
  className,
  full = false,
  hideCopy = false,
  label,
}: Props) {
  const [copied, setCopied] = React.useState(false)
  const { toast } = useToast()

  if (!value) {
    return <span className={cn('noetfield-mono text-muted-foreground', className)}>—</span>
  }

  const display = full ? value : truncateString(value, truncate)

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toastFn({
        title: 'Copied',
        description: label ? `${label} copied to clipboard` : 'Copied to clipboard',
      })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard not available in this context.',
        variant: 'destructive',
      })
    }
  }

  return (
    <span
      className={cn(
        'group inline-flex items-center gap-1.5 noetfield-mono text-xs',
        className,
      )}
    >
      <span className="truncate" title={value}>
        {display}
      </span>
      {!hideCopy && (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy to clipboard"
          className="text-muted-foreground transition-colors hover:text-foreground opacity-60 group-hover:opacity-100 cursor-pointer"
        >
          {copied ? <Check className="size-3 nf-pass" /> : <Copy className="size-3" />}
        </button>
      )}
    </span>
  )
}

export function truncateString(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}
