'use client'

/**
 * CodeBlock — a copyable code/pre block used in the Integrations and Docs
 * views. Mono font via `.noetfield-mono`, thin scrollbar via
 * `.noetfield-scroll`, and a Copy button pinned to the top-right corner.
 */

import * as React from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface Props {
  code: string
  language?: string
  className?: string
  /** Render the block without a label header. */
  bare?: boolean
}

export function CodeBlock({ code, language, className, bare = true }: Props) {
  const [copied, setCopied] = React.useState(false)

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast({ title: 'Copied', description: 'Snippet copied to clipboard' })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }

  return (
    <div
      className={cn(
        'group relative rounded-md border border-border bg-secondary/40',
        className,
      )}
    >
      {!bare && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {language ?? 'code'}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy code"
        className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground opacity-80 transition-opacity hover:text-foreground hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 nf-pass" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="noetfield-scroll noetfield-mono max-h-80 overflow-auto p-3 pr-12 text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}
