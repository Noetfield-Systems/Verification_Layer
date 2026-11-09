/**
 * POST /api/sina/run-domino-2
 *
 * Trigger one iteration of Sina's autonomous loop — Domino 2.
 *
 * The contract: NO new founder prompt. Sina reads its prior state from
 * SinaMemory, picks the next action from the prior verification result,
 * submits, verifies, issues a receipt, gets an independent attestation,
 * records state, and selects the next action.
 *
 * Body: { dominoRun?: number (default 2), maxSteps?: number, projectId?: string }
 * Returns: the full step trace + receipts + attestations + next action.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSinaOperator } from '@/lib/sina-auth'
import { db } from '@/lib/db'
import { runDomino } from '@/lib/sina-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const denied = requireSinaOperator(req)
  if (denied) return denied
  let body: { dominoRun?: number; maxSteps?: number; projectId?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — use defaults
  }
  // Resolve project: explicit > first project > seed a default
  let projectId = body.projectId
  if (!projectId) {
    const project = await db.project.findFirst({ orderBy: { createdAt: 'desc' } })
    if (!project) {
      return NextResponse.json(
        { error: { code: 'no_project', message: 'No project found. Call POST /api/seed first.' } },
        { status: 400 },
      )
    }
    projectId = project.id
  }
  const result = await runDomino({
    dominoRun: body.dominoRun ?? 2,
    maxSteps: body.maxSteps,
    projectId,
  })
  return NextResponse.json(result, { status: 200 })
}
