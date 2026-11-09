/**
 * GET /api/v1/usage
 *
 * Returns the API key's current free-tier usage. Auth: Bearer nf_live_…
 *
 * Response: { api_key_prefix, usage_count, free_tier_limit, window_days,
 *             window_started_at, remaining, resets_at }
 *
 * Call this before /verify to check if you're near the limit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveApiKey, ApiKeyError } from '@/lib/noetfield'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  let apiKey
  try {
    const bearerValue =
      authHeader && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7)
        : authHeader
    apiKey = await resolveApiKey(bearerValue)
  } catch (e) {
    if (e instanceof ApiKeyError)
      return NextResponse.json({ error: { code: 'unauthorized', message: (e as Error).message } }, { status: 401 })
    throw e
  }

  if (!apiKey.scopes.split(',').includes('verify:read')) return NextResponse.json({ error: { code: 'forbidden', message: 'API key lacks verify:read scope' } }, { status: 403 })
  if (!apiKey.projectId) return NextResponse.json({ error: { code: 'forbidden', message: 'API key requires a project' } }, { status: 403 })

  const FREE_TIER_LIMIT = Number(process.env.NOETFIELD_FREE_TIER_LIMIT || '100')
  const WINDOW_DAYS = Number(process.env.NOETFIELD_FREE_TIER_WINDOW_DAYS || '30')
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000)
  const usageCount = await db.verification.count({
    where: { projectId: apiKey.projectId || '', createdAt: { gte: windowStart } },
  })

  return NextResponse.json({
    api_key_prefix: apiKey.keyPrefix,
    usage_count: usageCount,
    free_tier_limit: FREE_TIER_LIMIT,
    window_days: WINDOW_DAYS,
    window_started_at: windowStart.toISOString(),
    remaining: Math.max(0, FREE_TIER_LIMIT - usageCount),
    plan: usageCount >= FREE_TIER_LIMIT ? 'free_tier_exhausted' : 'free_tier',
    upgrade_url: '/billing',
  })
}
