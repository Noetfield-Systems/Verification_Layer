'use client'

/**
 * Noetfield brand mark — a layered hexagonal containment prism.
 *
 * The outer hexagon is the verification envelope. The inner ring is the
 * artifact boundary. The vertical bar through the center is the verdict
 * axis (pass ↕ fail). The dot at the bottom is the deterministic anchor.
 *
 * Designed to read at 16px (sidebar) and 80px (landing hero) alike.
 */

import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  /** Show the wordmark next to the mark (for headers/landing). */
  withWordmark?: boolean
  /** Size class for the mark itself when withWordmark is false. */
  size?: 'sm' | 'md' | 'lg'
}

export function Logo({ className, withWordmark = false }: LogoProps) {
  const mark = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('text-emerald-500', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="noetfield-mark-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Outer hexagon — the verification envelope */}
      <path
        d="M16 2 28 9v14l-12 7L4 23V9l12-7Z"
        fill="url(#noetfield-mark-grad)"
        fillOpacity="0.12"
        stroke="url(#noetfield-mark-grad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner hexagon — the artifact boundary */}
      <path
        d="M16 7.5 23.5 12v8L16 24.5 8.5 20v-8L16 7.5Z"
        stroke="url(#noetfield-mark-grad)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Verdict axis — vertical bar */}
      <path
        d="M16 11v10"
        stroke="url(#noetfield-mark-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Deterministic anchor — the bottom dot */}
      <circle cx="16" cy="21" r="1.4" fill="url(#noetfield-mark-grad)" />
      {/* Top tick — the "input" */}
      <circle cx="16" cy="11" r="1" fill="url(#noetfield-mark-grad)" fillOpacity="0.6" />
    </svg>
  )

  if (!withWordmark) return mark

  return (
    <div className="flex items-center gap-2.5">
      {mark}
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Noetfield
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Agent Assurance
        </span>
      </div>
    </div>
  )
}

/** Compact wordmark for footer / small spaces. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight', className)}>
      Noetfield
    </span>
  )
}
