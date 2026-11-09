/** Project-owned API key management. All actions require a valid Bearer key. */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateApiKey, hashApiKey } from '@/lib/noetfield'
import { authenticatedKey, forbidden, unauthorized } from '@/lib/request-auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
interface KeyRequest { action: 'list' | 'create' | 'revoke'; name?: string; projectId?: string; id?: string }
export async function POST(req: NextRequest) {
  let active
  try { active = await authenticatedKey(req, 'keys:manage') } catch { return unauthorized() }
  let body: KeyRequest
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  if (body?.action === 'list') {
    const rows = await db.apiKey.findMany({ where: { ownerId: active.ownerId }, orderBy: { createdAt: 'desc' }, include: { project: { select: { id: true, name: true, slug: true } } } })
    return NextResponse.json({ keys: rows.map(k => ({ id: k.id, name: k.name, prefix: k.keyPrefix, project: k.project, scopes: k.scopes, created_at: k.createdAt.toISOString(), revoked_at: k.revokedAt?.toISOString() ?? null, last_used_at: k.lastUsedAt?.toISOString() ?? null })) })
  }
  if (body?.action === 'create') {
    const project = await db.project.findFirst({ where: { id: body.projectId || active.projectId || '', ownerId: active.ownerId } })
    if (!project) return forbidden()
    const plaintext = generateApiKey()
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : `Key ${new Date().toISOString().slice(0, 10)}`
    const row = await db.apiKey.create({ data: { keyHash: hashApiKey(plaintext), keyPrefix: plaintext.slice(0, 12), name, ownerId: active.ownerId, projectId: project.id, scopes: 'verify:write,verify:read' } })
    await db.auditLog.create({ data: { projectId: project.id, actorName: `apikey:${active.keyPrefix}…`, action: 'key.create', details: JSON.stringify({ keyId: row.id, name: row.name }) } })
    return NextResponse.json({ id: row.id, name: row.name, plaintext, prefix: row.keyPrefix, project: { id: project.id, name: project.name }, created_at: row.createdAt.toISOString() })
  }
  if (body?.action === 'revoke') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const row = await db.apiKey.findFirst({ where: { id: body.id, ownerId: active.ownerId } })
    if (!row) return forbidden()
    if (row.id === active.id) return NextResponse.json({ error: { code: 'self_revoke', message: 'Create a replacement key before revoking the active key' } }, { status: 409 })
    await db.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    await db.auditLog.create({ data: { projectId: row.projectId || undefined, actorName: `apikey:${active.keyPrefix}…`, action: 'key.revoke', details: JSON.stringify({ keyId: row.id }) } })
    return NextResponse.json({ ok: true, revoked: row.id })
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
