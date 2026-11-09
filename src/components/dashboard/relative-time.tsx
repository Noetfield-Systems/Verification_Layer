'use client'

/**
 * RelativeTime — a tiny component that renders a timestamp as "3m ago" /
 * "5h ago" / "2d ago" and re-renders every minute so it stays fresh.
 *
 * For absolute ISO display, callers can pass `absolute` to render the
 * full timestamp instead.
 */

import * as React from 'react'

interface Props {
  iso: string | null | undefined
  absolute?: boolean
  className?: string
}

export function RelativeTime({ iso, absolute = false, className }: Props) {
  const [, tick] = React.useReducer((x) => x + 1, 0)
  // Re-render every 60s so the relative label stays fresh.
  React.useEffect(() => {
    if (absolute || !iso) return
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [absolute, iso])

  if (!iso) return <span className={className}>—</span>

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return <span className={className}>{iso}</span>
  }

  if (absolute) {
    return <span className={className}>{date.toISOString()}</span>
  }

  const diffMs = Date.now() - date.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return <span className={className}>{sec}s ago</span>
  const min = Math.floor(sec / 60)
  if (min < 60) return <span className={className}>{min}m ago</span>
  const hr = Math.floor(min / 60)
  if (hr < 24) return <span className={className}>{hr}h ago</span>
  const day = Math.floor(hr / 24)
  if (day < 30) return <span className={className}>{day}d ago</span>
  return <span className={className}>{date.toISOString().slice(0, 10)}</span>
}
