/**
 * POST /api/v1/verify
 *
 * Submit an artifact for verification. Returns immediately with a job_id.
 * The verification runs synchronously inside this request (the engine is
 * fast — <50ms for typical artifacts), but the response shape is async so
 * the same SDK can poll when we move to a queue-backed executor.
 *
 * Auth: Bearer nf_live_…
 * Body:  { artifact, artifact_type, metadata: { source, project_id } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runVerification } from '@/lib/engine/verify'
import {
  costPerVerify,
  ensurePolicyBootstrap,
  hashApiKey,
  noetfieldSecret,
  resolveApiKey,
  ApiKeyError,
  storedPolicyHash,
} from '@/lib/noetfield'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VerifyRequestBody {
  artifact: string | Record<string, string>
  artifact_type?: 'code' | 'workflow' | 'config'
  metadata?: {
    source?: 'bolt' | 'v0' | 'cursor' | 'custom'
    project_id?: string
    model_identity?: string
    [k: string]: unknown
  }
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const authHeader = req.headers.get('authorization') || req.headers.get('x-api-key')
  let apiKey
  try {
    const bearerValue =
      authHeader && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7)
        : authHeader
    apiKey = await resolveApiKey(bearerValue)
  } catch (e) {
    if (e instanceof ApiKeyError) return errorResponse(401, 'unauthorized', e.message)
    throw e
  }

  if (!apiKey.scopes.split(',').includes('verify:write')) return errorResponse(403, 'forbidden', 'API key lacks verify:write scope')

  // 2. Parse + validate body
  let body: VerifyRequestBody
  try {
    body = (await req.json()) as VerifyRequestBody
  } catch {
    return errorResponse(400, 'bad_request', 'request body must be valid JSON')
  }
  if (!body || typeof body !== 'object' || !body.artifact || (typeof body.artifact !== 'string' && typeof body.artifact !== 'object')) {
    return errorResponse(400, 'bad_request', 'artifact is required (string or {path: contents})')
  }
  const artifact = body.artifact
  if (typeof artifact === 'string') {
    if (Buffer.byteLength(artifact, 'utf8') > 262144) return errorResponse(413, 'artifact_too_large', 'Maximum artifact size is 256 KiB')
  } else if (!artifact || Array.isArray(artifact) || Object.getPrototypeOf(artifact) !== Object.prototype) {
    return errorResponse(400, 'invalid_artifact', 'Expected a file-path-to-source map')
  } else {
    const entries = Object.entries(artifact)
    if (entries.length > 100 || entries.some(([path, content]) => !path || path.length > 300 || typeof content !== 'string') || Buffer.byteLength(JSON.stringify(artifact), 'utf8') > 262144) {
      return errorResponse(413, 'invalid_artifact', 'File bundle must contain at most 100 text files and 256 KiB total')
    }
  }
  if (body.artifact_type && !['code', 'workflow', 'config'].includes(body.artifact_type)) return errorResponse(400, 'bad_request', 'invalid artifact_type')
  const artifactType = body.artifact_type || 'code'
  const source = body.metadata?.source || 'custom'
  if (body.metadata !== undefined && (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata) || Buffer.byteLength(JSON.stringify(body.metadata), 'utf8') > 16384)) return errorResponse(400, 'invalid_metadata', 'metadata must be an object of at most 16 KiB')
  const projectIdFromMeta = body.metadata?.project_id
  if (projectIdFromMeta !== undefined && typeof projectIdFromMeta !== 'string') return errorResponse(400, 'invalid_project_id', 'project ID must be a string')
  const projectId = projectIdFromMeta || apiKey.projectId
  if (!projectId) {
    return errorResponse(
      400,
      'bad_request',
      'project_id is required (in metadata.project_id or bound to the API key)',
    )
  }
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return errorResponse(404, 'project_not_found', 'project not found')
  if (project.ownerId !== apiKey.ownerId || apiKey.projectId !== projectId) return errorResponse(403, 'forbidden', 'API key is not authorized for this project')

  // 3. Bootstrap policy (G5) — idempotent
  await ensurePolicyBootstrap()
  const expectedPolicyHash = await storedPolicyHash()

  // 4. Run the engine — deterministic
  const issuedAtUnix = Math.floor(Date.now() / 1000)
  const result = runVerification(
    {
      artifact: body.artifact,
      artifactType,
      source,
      projectId,
      modelIdentity: body.metadata?.model_identity,
      metadata: body.metadata,
    },
    {
      expectedPolicyHash,
      secret: noetfieldSecret(),
      costUsdPerVerify: costPerVerify(),
      issuedAtUnix,
    },
  )

  // 5. PostgreSQL per-project advisory transaction lock serializes quota decisions
  // across all application replicas. Idempotent replays do not consume quota,
  // including after the free-tier limit is reached.
  const FREE_TIER_LIMIT = Number(process.env.NOETFIELD_FREE_TIER_LIMIT || '100')
  const WINDOW_DAYS = Number(process.env.NOETFIELD_FREE_TIER_WINDOW_DAYS || '30')
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000)
  const artifactRef = typeof body.artifact === 'object'
    ? Object.keys(body.artifact).sort().join(',')
    : `inline:${result.artifactHash.slice(7, 19)}`

  const outcome = await db.$transaction(async (tx) => {
    // A lock is automatically released on commit / rollback. Parameterized SQL
    // prevents injection. This API deliberately requires PostgreSQL in production.
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${projectId}))) AS held_lock`
    const existing = await tx.verification.findUnique({
      where: { verdictHash: result.verdictHash }, include: { receipt: true },
    })
    if (existing) {
      if (!existing.receipt) return { kind: 'incomplete' as const }
      let deployToken = existing.deployToken
      let tokenExpiry = existing.tokenExpiry
      if (result.verdict === 'pass' && result.deployToken &&
          (!existing.tokenExpiry || existing.tokenExpiry.getTime() < Date.now())) {
        deployToken = result.deployToken.token
        tokenExpiry = new Date(result.deployToken.expiryUnix * 1000)
        await tx.verification.update({ where: { id: existing.id }, data: { deployToken, tokenExpiry } })
      }
      await tx.auditLog.create({ data: {
        projectId, actorName: `apikey:${apiKey.keyPrefix}…`, action: 'verify.replay',
        details: JSON.stringify({ verdictHash: result.verdictHash, idempotent: true }),
      } })
      return { kind: 'existing' as const, verification: existing, deployToken, tokenExpiry }
    }

    const usageCount = await tx.verification.count({
      where: { projectId, createdAt: { gte: windowStart } },
    })
    if (usageCount >= FREE_TIER_LIMIT) return { kind: 'quota' as const, usageCount }

    const verification = await tx.verification.create({ data: {
      projectId, apiKeyId: apiKey.id, artifactHash: result.artifactHash,
      artifactType, artifactRef, status: 'complete', verdict: result.verdict,
      verdictHash: result.verdictHash, gates: JSON.stringify(result.gates),
      deployToken: result.deployToken?.token ?? null,
      tokenExpiry: result.deployToken ? new Date(result.deployToken.expiryUnix * 1000) : null,
      costUsd: result.costUsd, modelIdentity: body.metadata?.model_identity ?? null,
      source, metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      completedAt: new Date(),
    } })
    await tx.receipt.create({ data: {
      verificationId: verification.id, receiptJson: result.receiptJson,
      artifactRef, signature: result.receiptSignature,
    } })
    await tx.auditLog.create({ data: {
      projectId, actorName: `apikey:${apiKey.keyPrefix}…`, action: 'verify.create',
      details: JSON.stringify({ verdict: result.verdict, verdictHash: result.verdictHash,
        artifactHash: result.artifactHash }),
    } })
    return { kind: 'created' as const, verification }
  }, { timeout: 15_000 })

  if (outcome.kind === 'quota') return NextResponse.json({ error: {
    code: 'free_tier_exceeded',
    message: `You've used ${outcome.usageCount}/${FREE_TIER_LIMIT} free verifications in the last ${WINDOW_DAYS} days.`,
    usage: { count: outcome.usageCount, limit: FREE_TIER_LIMIT, window_days: WINDOW_DAYS },
    upgrade_url: '/billing', pricing_url: '/#pricing',
  } }, { status: 402 })
  if (outcome.kind === 'incomplete') return errorResponse(503, 'receipt_incomplete', 'Verification record is awaiting repair')

  const verification = outcome.verification
  return NextResponse.json({
    job_id: verification.id, status: 'complete', verdict: verification.verdict,
    verdict_hash: verification.verdictHash, artifact_hash: verification.artifactHash,
    gates: result.gates.map((g) => ({ name: g.name, passed: g.passed, detail: g.detail })),
    deploy_token: outcome.kind === 'existing' ? outcome.deployToken : result.deployToken?.token ?? null,
    token_expiry: outcome.kind === 'existing'
      ? outcome.tokenExpiry?.toISOString() ?? null
      : result.deployToken?.expiresAt ?? null,
    cost_usd: verification.costUsd, receipt_url: `/api/v1/receipt/${result.verdictHash}`,
    idempotent: outcome.kind === 'existing',
  }, { status: outcome.kind === 'existing' ? 200 : 201 })

}

/** GET /api/v1/verify — list recent verifications for the API key's project. */
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
    if (e instanceof ApiKeyError) return errorResponse(401, 'unauthorized', e.message)
    throw e
  }
  if (!apiKey.scopes.split(',').includes('verify:read')) return errorResponse(403, 'forbidden', 'API key lacks verify:read scope')
  if (!apiKey.projectId) return errorResponse(403, 'forbidden', 'API key must be bound to a project')
  const rows = await db.verification.findMany({
    where: { projectId: apiKey.projectId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    verifications: rows.map((v) => ({
      id: v.id,
      project_id: v.projectId,
      verdict: v.verdict,
      verdict_hash: v.verdictHash,
      artifact_hash: v.artifactHash,
      artifact_type: v.artifactType,
      source: v.source,
      cost_usd: v.costUsd,
      status: v.status,
      created_at: v.createdAt,
      completed_at: v.completedAt,
    })),
  })
}

// Re-export for type checking — hashApiKey is used by the seed route
export { hashApiKey }
