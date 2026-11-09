/**
 * GET /api/v1/verify/:job_id
 *
 * Poll a verification job. Returns the verdict + gate results + receipt URL
 * + deploy token (only if verdict === 'pass').
 *
 * Auth: Bearer nf_live_…
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveApiKey, ApiKeyError } from '@/lib/noetfield'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> },
) {
  const { job_id } = await params
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
  const row = await db.verification.findUnique({ where: { id: job_id } })
  if (!row)
    return NextResponse.json({ error: { code: 'not_found', message: 'verification not found' } }, { status: 404 })
  // The caller must have access to the project the verification belongs to.
  if (!apiKey.projectId || apiKey.projectId !== row.projectId) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'api key is not bound to this project' } }, { status: 403 })
  }

  const gates = row.gates ? (JSON.parse(row.gates) as Array<{ name: string; passed: boolean; detail: string }>) : null

  return NextResponse.json({
    status: row.status,
    verdict: row.verdict,
    verdict_hash: row.verdictHash,
    artifact_hash: row.artifactHash,
    artifact_type: row.artifactType,
    source: row.source,
    model_identity: row.modelIdentity,
    gates,
    receipt_url: row.verdictHash ? `/api/v1/receipt/${row.verdictHash}` : null,
    deploy_token: row.verdict === 'pass' ? row.deployToken : null,
    token_expiry: row.tokenExpiry?.toISOString() ?? null,
    cost_usd: row.costUsd,
    created_at: row.createdAt,
    completed_at: row.completedAt,
  })
}
