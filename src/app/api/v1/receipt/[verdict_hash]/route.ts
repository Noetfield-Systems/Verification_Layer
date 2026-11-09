/**
 * GET /api/v1/receipt/:verdict_hash
 *
 * Retrieve the full tamper-proof receipt for a verification. The receipt
 * is the canonical JSON document stored at verification time, plus its
 * HMAC signature. Anyone can verify the signature against the receipt body
 * using the Noetfield public verification algorithm — the secret only
 * signs, it does not decrypt.
 *
 * Public endpoint (no auth) — receipts are designed to be shared with
 * auditors. The verdict_hash in the URL is the lookup key.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticatedKey, unauthorized } from '@/lib/request-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ verdict_hash: string }> }) {
  let key
  try { key = await authenticatedKey(req, 'verify:read') } catch { return unauthorized() }
  const { verdict_hash } = await params
  const verification = await db.verification.findUnique({
    where: { verdictHash: verdict_hash },
    include: { receipt: true, project: true },
  })
  if (!verification || !verification.receipt || (verification.project.ownerId !== key.ownerId || (!key.scopes.split(',').includes('dashboard:read') && verification.projectId !== key.projectId))) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'no receipt found for that verdict hash' } },
      { status: 404 },
    )
  }
  return NextResponse.json({
    receipt: JSON.parse(verification.receipt.receiptJson),
    signature: verification.receipt.signature,
    signature_algorithm: 'HMAC-SHA256',
    verification_url: '/api/v1/verify-token',
    artifact_ref: verification.receipt.artifactRef,
    project: verification.project
      ? { id: verification.project.id, name: verification.project.name }
      : null,
    retrieved_at: new Date().toISOString(),
  })
}
