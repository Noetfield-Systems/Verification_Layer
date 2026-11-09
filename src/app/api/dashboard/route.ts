/** Authenticated, owner-scoped dashboard data. No ambient demo identity. */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticatedKey, forbidden, unauthorized, ownedProjectId } from '@/lib/request-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DashboardRequest {
  action: 'stats' | 'verifications' | 'audit' | 'projects' | 'single'
  verificationId?: string
  projectId?: string
  verdict?: 'pass' | 'fail'
  limit?: number
  offset?: number
}

export async function POST(req: NextRequest) {
  let key
  try { key = await authenticatedKey(req, 'dashboard:read') } catch { return unauthorized() }
  let body: DashboardRequest
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (body.action === 'projects') return listProjects(key.ownerId)
  const projectId = await ownedProjectId(key.ownerId, body.projectId, key.projectId)
  if (!projectId) return forbidden()
  switch (body.action) {
    case 'stats': return stats(projectId, key.ownerId)
    case 'verifications': return listVerifications(body, projectId)
    case 'audit': return listAudit(body, projectId)
    case 'single': return single(body.verificationId, projectId)
    default: return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }
}

async function stats(projectId: string, ownerId: string) {
  const where = { projectId }
  const [total, passed, failed, totalCost, todayCount, projectsCount] = await Promise.all([
    db.verification.count({ where }),
    db.verification.count({ where: { ...where, verdict: 'pass' } }),
    db.verification.count({ where: { ...where, verdict: 'fail' } }),
    db.verification.aggregate({ where, _sum: { costUsd: true } }),
    db.verification.count({ where: { ...where, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    db.project.count({ where: { ownerId } }),
  ])
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const recent = await db.verification.findMany({ where: { ...where, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true, verdict: true, costUsd: true } })
  const buckets: Record<string, { date: string; pass: number; fail: number; cost: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
    buckets[date] = { date, pass: 0, fail: 0, cost: 0 }
  }
  for (const v of recent) {
    const b = buckets[v.createdAt.toISOString().slice(0, 10)]
    if (!b) continue
    if (v.verdict === 'pass') b.pass++
    if (v.verdict === 'fail') b.fail++
    b.cost += v.costUsd ?? 0
  }
  return NextResponse.json({ total, passed, failed, pass_rate: total ? passed / total : 0, total_cost_usd: totalCost._sum.costUsd ?? 0, today_count: todayCount, projects_count: projectsCount, seven_day_trend: Object.values(buckets), scoped_to_project_id: projectId })
}

async function listVerifications(body: DashboardRequest, projectId: string) {
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200)
  const offset = Math.max(Number(body.offset) || 0, 0)
  const rows = await db.verification.findMany({
    where: { projectId, ...(body.verdict === 'pass' || body.verdict === 'fail' ? { verdict: body.verdict } : {}) },
    orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
    include: { project: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json({
    verifications: rows.map(v => ({
      id: v.id, project: v.project, verdict: v.verdict, verdict_hash: v.verdictHash,
      artifact_hash: v.artifactHash, artifact_type: v.artifactType, artifact_ref: v.artifactRef,
      source: v.source, model_identity: v.modelIdentity, cost_usd: v.costUsd, status: v.status,
      deploy_token: v.deployToken, token_expiry: v.tokenExpiry?.toISOString() ?? null,
      created_at: v.createdAt.toISOString(), completed_at: v.completedAt?.toISOString() ?? null,
    })), count: rows.length, scoped_to_project_id: projectId,
  })
}

async function listAudit(body: DashboardRequest, projectId: string) {
  const rows = await db.auditLog.findMany({
    where: { projectId }, orderBy: { timestamp: 'desc' },
    take: Math.min(Math.max(Number(body.limit) || 50, 1), 200), skip: Math.max(Number(body.offset) || 0, 0),
  })
  return NextResponse.json({ audit: rows.map(r => ({ id: r.id, project_id: r.projectId, actor: r.actorName, action: r.action, details: r.details ? JSON.parse(r.details) : null, timestamp: r.timestamp.toISOString() })) })
}

async function listProjects(ownerId: string) {
  const rows = await db.project.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { verifications: true } } } })
  return NextResponse.json({ projects: rows.map(p => ({ id: p.id, name: p.name, slug: p.slug, verification_count: p._count.verifications, created_at: p.createdAt.toISOString() })) })
}

async function single(verificationId: string | undefined, projectId: string) {
  if (!verificationId) return NextResponse.json({ error: 'verificationId required' }, { status: 400 })
  const row = await db.verification.findFirst({ where: { id: verificationId, projectId }, include: { project: { select: { id: true, name: true, slug: true } }, receipt: true } })
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    id: row.id, project: row.project, verdict: row.verdict, verdict_hash: row.verdictHash,
    artifact_hash: row.artifactHash, artifact_type: row.artifactType, artifact_ref: row.artifactRef,
    source: row.source, model_identity: row.modelIdentity, cost_usd: row.costUsd,
    status: row.status, deploy_token: row.deployToken, token_expiry: row.tokenExpiry?.toISOString() ?? null,
    gates: row.gates ? JSON.parse(row.gates) : null, metadata: row.metadata ? JSON.parse(row.metadata) : null,
    receipt: row.receipt ? { receipt: JSON.parse(row.receipt.receiptJson), signature: row.receipt.signature, signature_algorithm: 'HMAC-SHA256' } : null,
    created_at: row.createdAt.toISOString(), completed_at: row.completedAt?.toISOString() ?? null,
  })
}
