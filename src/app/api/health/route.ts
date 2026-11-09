/** Public release attestation: Railway injects commit SHA from GitHub deployment. */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  const revision = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || null
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', database: 'connected', revision }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable', revision }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
