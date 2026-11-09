/**
 * GET /api/audit
 *
 * Audit log export for compliance. Returns the most recent N entries.
 * Optionally accepts ?projectId=...&limit=...
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId') || undefined
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 1000)
  const rows = await db.auditLog.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: { project: { select: { id: true, name: true, slug: true } } },
  })
  return NextResponse.json({
    audit: rows.map((r) => ({
      id: r.id,
      project: r.project,
      actor: r.actorName,
      action: r.action,
      details: r.details ? JSON.parse(r.details) : null,
      timestamp: r.timestamp.toISOString(),
    })),
    count: rows.length,
    exported_at: new Date().toISOString(),
  })
}
