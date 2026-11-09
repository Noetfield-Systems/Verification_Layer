/** Owner-scoped project management. No public fallback or demo side effects. */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticatedKey, unauthorized } from '@/lib/request-auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
interface ProjectRequest { action: 'list' | 'create'; name?: string; slug?: string }
export async function POST(req: NextRequest) {
  let active
  try { active = await authenticatedKey(req, 'projects:manage') } catch { return unauthorized() }
  let body: ProjectRequest
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  if (body?.action === 'list') {
    const rows = await db.project.findMany({ where: { ownerId: active.ownerId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { verifications: true, apiKeys: true } }, owner: { select: { email: true, name: true } } } })
    return NextResponse.json({ projects: rows.map(p => ({ id: p.id, name: p.name, slug: p.slug, owner: p.owner, verification_count: p._count.verifications, api_key_count: p._count.apiKeys, created_at: p.createdAt.toISOString() })) })
  }
  if (body?.action === 'create') {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return NextResponse.json({ error: 'name invalid' }, { status: 400 })
    const slug = (typeof body.slug === 'string' ? body.slug : body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 65)
    if (!slug) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })
    const existing = await db.project.findUnique({ where: { slug } })
    if (existing) return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    const row = await db.project.create({ data: { name: body.name.trim(), slug, ownerId: active.ownerId } })
    await db.auditLog.create({ data: { projectId: row.id, actorName: `apikey:${active.keyPrefix}…`, action: 'project.create', details: JSON.stringify({ name: row.name, slug: row.slug }) } })
    return NextResponse.json({ id: row.id, name: row.name, slug: row.slug, created_at: row.createdAt.toISOString() })
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
