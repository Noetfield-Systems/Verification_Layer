/**
 * GET /api/sina/state
 *
 * Read Sina's persisted memory. After a restart, the loop reads this to
 * reconstruct context — the proof that Sina continues without a new prompt.
 *
 * Query: ?dominoRun=2 (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSinaOperator } from '@/lib/sina-auth'
import { readSinaState } from '@/lib/sina-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = requireSinaOperator(req)
  if (denied) return denied
  const url = new URL(req.url)
  const dominoRun = url.searchParams.get('dominoRun')
    ? Number(url.searchParams.get('dominoRun'))
    : undefined
  const state = await readSinaState(dominoRun)
  return NextResponse.json(state)
}
