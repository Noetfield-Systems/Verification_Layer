/**
 * POST /api/sina/submit-candidate
 *
 * Ingestion point for new NextActionCandidate rows.
 *
 * In production: Sina's evidence pipeline calls this endpoint after DeepSeek
 * proposes a NextActionCandidate from business evidence. The candidate lands
 * in the queue, and the next run of /api/sina/run-domino-2 picks it up.
 *
 * In sandbox: you can call this manually to add candidates to the queue.
 *
 * Body: { label, artifact, artifactType, source, modelIdentity?, evidence?, step? }
 * Returns: { id, step, status: 'pending' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSinaOperator } from '@/lib/sina-auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SubmitBody {
  label?: string
  artifact?: string
  artifactType?: string
  source?: string
  modelIdentity?: string
  evidence?: Record<string, unknown>
  step?: number
}

export async function POST(req: NextRequest) {
  const denied = requireSinaOperator(req)
  if (denied) return denied
  let body: SubmitBody
  try {
    body = (await req.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'invalid JSON' } }, { status: 400 })
  }
  if (!body.artifact || typeof body.artifact !== 'string') {
    return NextResponse.json({ error: { code: 'bad_request', message: 'artifact is required' } }, { status: 400 })
  }
  if (!body.label) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'label is required' } }, { status: 400 })
  }
  const artifactType = (body.artifactType as string) || 'code'
  const source = (body.source as string) || 'custom'

  // Determine step: explicit > next available
  let step = body.step
  if (step == null) {
    const maxStep = await db.nextActionCandidate.aggregate({ _max: { step: true } })
    step = (maxStep._max.step ?? 0) + 1
  }

  const candidate = await db.nextActionCandidate.create({
    data: {
      step,
      label: body.label,
      artifact: body.artifact,
      artifactType,
      source,
      modelIdentity: body.modelIdentity || null,
      evidence: body.evidence ? JSON.stringify(body.evidence) : null,
      status: 'pending',
    },
  })

  return NextResponse.json(
    {
      id: candidate.id,
      step: candidate.step,
      status: candidate.status,
      label: candidate.label,
      queued_at: candidate.createdAt.toISOString(),
    },
    { status: 201 },
  )
}

/** GET — list candidates with their status. */
export async function GET(req: NextRequest) {
  const denied = requireSinaOperator(req)
  if (denied) return denied
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const rows = await db.nextActionCandidate.findMany({
    where: status ? { status } : undefined,
    orderBy: { step: 'asc' },
    take: 50,
    select: {
      id: true,
      step: true,
      label: true,
      status: true,
      attemptCount: true,
      verdictHash: true,
      artifactHash: true,
      githubBranch: true,
      githubCommitSha: true,
      githubUrl: true,
      createdAt: true,
      processedAt: true,
    },
  })
  return NextResponse.json({
    candidates: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    })),
  })
}
