/** Authentication and project authorization. Never fall back to a demo identity. */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiKeyError, resolveApiKey } from '@/lib/noetfield'

export async function authenticatedKey(req: NextRequest, scope?: string) {
  const header = req.headers.get('authorization')
  // Accept only the standard Bearer scheme for management endpoints.
  if (!header || !/^Bearer nf_live_[0-9a-f]{48}$/i.test(header)) {
    throw new ApiKeyError('valid Bearer API key required')
  }
  const key = await resolveApiKey(header.slice(7))
  if (scope && !key.scopes.split(',').includes(scope)) throw new ApiKeyError('API key missing required scope')
  return key
}

export function unauthorized() {
  return NextResponse.json({ error: { code: 'unauthorized', message: 'Authentication required or API key invalid' } }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: { code: 'forbidden', message: 'Not authorized for this project' } }, { status: 403 })
}

export async function ownedProjectId(ownerId: string, requestedProjectId: string | undefined | null, defaultId: string | null) {
  if (!requestedProjectId) return defaultId
  const project = await db.project.findFirst({ where: { id: requestedProjectId, ownerId }, select: { id: true } })
  return project?.id ?? null
}
