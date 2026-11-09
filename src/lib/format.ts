/**
 * Noetfield formatting helpers (client-safe, no Node deps).
 */

/** Format a USD amount with a fixed number of decimals (default 2). */
export function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '$0.00'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Format a percentage 0..1 → "12.3%". */
export function formatPct(rate: number, decimals = 1): string {
  if (!Number.isFinite(rate)) return '0%'
  return `${(rate * 100).toFixed(decimals)}%`
}

/** Zero-pad a number to two digits. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Render a live "expires in 14m 32s" countdown from a future ISO timestamp.
 * Returns "expired" if the timestamp is in the past.
 */
export function countdownFromIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return '—'
  const diff = target - Date.now()
  if (diff <= 0) return 'expired'
  const totalSec = Math.floor(diff / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${pad2(s)}s`
}
