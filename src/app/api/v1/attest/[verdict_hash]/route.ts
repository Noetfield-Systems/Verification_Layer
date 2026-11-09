/**
 * GET /api/v1/attest/:verdict_hash
 *
 * Owner-authorized attestation endpoint. The verifier shares this process and
 * database; it is NOT a separately isolated or third-party security boundary.
 *
 * The verifier re-fetches the receipt, re-checks the HMAC signature locally,
 * optionally re-runs the gates (if ?artifact= is provided), and issues its
 * OWN attestation signed with NOETFIELD_VERIFIER_SECRET (a different secret
 * from NOETFIELD_RECEIPT_SECRET).
 *
 * Returns: { verified, signature_valid, gates_recomputed, gates_matched,
 *            attestation, attestation_signature, verifier_id, verified_at }
 */

import { NextRequest, NextResponse } from 'next/server'
import { attest } from '@/lib/independent-verifier'
import { db } from '@/lib/db'
import { authenticatedKey, unauthorized } from '@/lib/request-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ verdict_hash: string }> }) {
  let key
  try { key = await authenticatedKey(req, 'verify:read') } catch { return unauthorized() }
  const { verdict_hash } = await params
  const verification = await db.verification.findUnique({ where: { verdictHash: verdict_hash }, select: { project: { select: { ownerId: true, id: true } } } })
  if (!verification || (verification.project.ownerId !== key.ownerId || (!key.scopes.split(',').includes('dashboard:read') && verification.project.id !== key.projectId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const url = new URL(req.url)
  // Optional: caller passes the artifact so we can re-run the gates.
  const artifact = url.searchParams.get('artifact') || undefined
  const artifactType = (url.searchParams.get('artifact_type') as 'code' | 'workflow' | 'config') || undefined
  const source = (url.searchParams.get('source') as 'bolt' | 'v0' | 'cursor' | 'custom') || undefined
  const projectId = url.searchParams.get('project_id') || undefined

  const result = await attest({
    verdictHash: verdict_hash,
    artifact: artifact || undefined,
    artifactType,
    source,
    projectId,
  })

  return NextResponse.json({
    verified: result.verified,
    signature_valid: result.signatureValid,
    gates_recomputed: result.gatesRecomputed,
    gates_matched: result.gatesMatched,
    receipt_found: result.receiptFound,
    reason: result.reason,
    verifier_id: result.attestation.verifier_id,
    verified_at: result.attestation.verified_at,
    verdict_hash: result.verdictHash,
    attestation: result.attestation,
    attestation_json: result.attestationJson || undefined,
    attestation_signature: result.attestationSignature || undefined,
    attestation_algorithm: 'HMAC-SHA256',
    verify_attestation_url: '/api/v1/attest/' + verdict_hash,
  })
}
