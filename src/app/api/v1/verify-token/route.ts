/**
 * POST /api/v1/verify-token
 *
 * Infrastructure (Cloudflare / Railway / AWS) calls this endpoint before
 * deploying an artifact. The token must be:
 *  - correctly signed by Noetfield
 *  - bound to the artifact hash being deployed
 *  - unexpired (15-minute TTL)
 *
 * Body: { deploy_token, artifact_hash }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { noetfieldSecret } from '@/lib/noetfield'
import { authenticatedKey, unauthorized } from '@/lib/request-auth'
import { verifyDeployToken } from '@/lib/engine/token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let key
  try { key = await authenticatedKey(req, 'verify:read') } catch { return unauthorized() }
  if (!key.projectId) return NextResponse.json({ error: 'key_not_bound_to_project' }, { status: 403 })
  let body: { deploy_token?: string; artifact_hash?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'invalid JSON' } }, { status: 400 })
  }
  if (!body.deploy_token || !body.artifact_hash) {
    return NextResponse.json(
      { error: { code: 'bad_request', message: 'deploy_token and artifact_hash are required' } },
      { status: 400 },
    )
  }
  const nowUnix = Math.floor(Date.now() / 1000)
  const result = verifyDeployToken(noetfieldSecret(), body.deploy_token, body.artifact_hash, nowUnix, (hash) => {
    // Synchronous lookup helper — we resolve via a cache. For simplicity,
    // we let the caller invoke the receipt endpoint separately if they
    // need the verdict hash; here we do a best-effort lookup.
    return null
  })
  // If signature valid, look up the verification row for verdict hash
  let verdictHash: string | null = null
  if (result.signatureValid) {
    const v = await db.verification.findFirst({
      where: { artifactHash: body.artifact_hash, verdict: 'pass', projectId: key.projectId, deployToken: body.deploy_token },
      orderBy: { completedAt: 'desc' },
      select: { verdictHash: true },
    })
    verdictHash = v?.verdictHash ?? null
  }
  return NextResponse.json({
    valid: result.valid && !!verdictHash,
    expired: result.expired,
    signature_valid: result.signatureValid,
    artifact_hash_matches: result.artifactHashMatches,
    expiry: result.expiry,
    verdict_hash: verdictHash,
    reason: result.valid && !verdictHash ? 'token not issued to an authorized verification in this project' : result.reason,
    checked_at: new Date().toISOString(),
  })
}
