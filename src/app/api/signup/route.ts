/** Verified passwordless onboarding: POST sends an email OTP, PUT consumes it and issues a project-bound API key. */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomInt } from 'node:crypto'
import { db } from '@/lib/db'
import { generateApiKey, hashApiKey, noetfieldSecret } from '@/lib/noetfield'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const error = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
const normalEmail = (x: unknown) => typeof x === 'string' ? x.trim().toLowerCase() : ''
const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
const hashCode = (email: string, code: string) => createHmac('sha256', noetfieldSecret()).update(`signup-v1:${email}:${code}`).digest('hex')
const cleanText = (x: unknown, max: number) => typeof x === 'string' ? x.trim().slice(0, max) || null : null
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-project'

/** Ask for a one-time code. Delivery is mandatory; no email -> no key. */
export async function POST(req: NextRequest) {
  let body: { email?: string; name?: string; companyName?: string }
  try { body = await req.json() } catch { return error(400, 'bad_request', 'Valid JSON required') }
  const email = normalEmail(body?.email)
  if (!validEmail(email)) return error(400, 'invalid_email', 'A valid email is required')
  if (!process.env.RESEND_API_KEY || !process.env.NOETFIELD_EMAIL_FROM) {
    return error(503, 'signup_unavailable', 'Email signup is not configured yet; contact operations@noetfield.com')
  }
  const existing = await db.emailLoginChallenge.findUnique({ where: { email } })
  if (existing && Date.now() - existing.requestedAt.getTime() < 60_000) {
    return error(429, 'rate_limited', 'Check your email or retry after one minute')
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
  await db.emailLoginChallenge.upsert({
    where: { email },
    create: { email, codeHash: hashCode(email, code), attempts: 0, expiresAt, name: cleanText(body.name, 100), companyName: cleanText(body.companyName, 100) },
    update: { codeHash: hashCode(email, code), attempts: 0, requestedAt: new Date(), expiresAt, name: cleanText(body.name, 100), companyName: cleanText(body.companyName, 100) },
  })
  let delivered = false
  try {
    // Mock transport is allowed only on CI runners, and only over loopback.
    const mockUrl = process.env.CI === 'true' && /^http:\/\/127\.0\.0\.1:\d+\/emails$/.test(process.env.NOETFIELD_E2E_RESEND_URL || '')
      ? process.env.NOETFIELD_E2E_RESEND_URL! : 'https://api.resend.com/emails'
    const response = await fetch(mockUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOETFIELD_EMAIL_FROM, to: [email], subject: 'Noetfield: your verification code', text: `Your Noetfield sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you did not request it, ignore this email.` }),
      cache: 'no-store',
    })
    delivered = response.ok
  } catch { /* Report without exposing provider credentials. */ }
  if (!delivered) {
    await db.emailLoginChallenge.deleteMany({ where: { email, codeHash: hashCode(email, code) } })
    return error(502, 'email_delivery_failed', 'Unable to deliver a verification email. Please retry later')
  }
  return NextResponse.json({ status: 'email_verification_required', expires_in_seconds: CODE_TTL_MINUTES * 60 }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
}

/** Confirm mailbox ownership. Issue a key once, only after a valid, unexpired email code. */
export async function PUT(req: NextRequest) {
  let body: { email?: string; code?: string }
  try { body = await req.json() } catch { return error(400, 'bad_request', 'Valid JSON required') }
  const email = normalEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return error(400, 'invalid_code', 'Valid email and six-digit code required')
  const challenge = await db.emailLoginChallenge.findUnique({ where: { email } })
  if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= MAX_ATTEMPTS) {
    return error(400, 'code_expired', 'Verification code expired or attempts exhausted; request a new code')
  }
  if (challenge.codeHash !== hashCode(email, code)) {
    await db.emailLoginChallenge.updateMany({ where: { email, codeHash: challenge.codeHash, attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } })
    return error(400, 'invalid_code', 'Incorrect verification code')
  }
  // Atomically consume the challenge to prevent OTP replay from concurrent requests.
  const consumed = await db.emailLoginChallenge.updateMany({
    where: { email, codeHash: challenge.codeHash, expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: MAX_ATTEMPTS, expiresAt: new Date(0) },
  })
  if (consumed.count !== 1) return error(409, 'already_consumed', 'Code already used')
  const user = await db.user.upsert({ where: { email }, create: { email, name: challenge.name, role: 'developer' }, update: {} })
  let project = await db.project.findFirst({ where: { ownerId: user.id } })
  if (!project) {
    const base = slugify(challenge.companyName || email.split('@')[0])
    for (let i = 0; i < 100 && !project; i++) {
      const slug = i === 0 ? base : `${base}-${i}`
      try { project = await db.project.create({ data: { name: challenge.companyName || `${email.split('@')[0]}'s project`, slug, ownerId: user.id } }) }
      catch (e) {
        if (!(await db.project.findUnique({ where: { slug } }))) throw e
      }
    }
  }
  if (!project) return error(500, 'signup_error', 'Unable to provision a project')
  const plaintext = generateApiKey()
  const key = await db.apiKey.create({ data: { keyHash: hashApiKey(plaintext), keyPrefix: plaintext.slice(0, 12), name: `Verified signup ${new Date().toISOString().slice(0,10)}`, ownerId: user.id, projectId: project.id, scopes: 'verify:write,verify:read,dashboard:read,projects:manage,keys:manage' } })
  await db.auditLog.create({ data: { projectId: project.id, actorName: `email-verified:${email}`, action: 'key.create', details: JSON.stringify({ keyId: key.id, emailVerified: true }) } })
  const origin = (process.env.NOETFIELD_PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, '')
  return NextResponse.json({
    api_key: plaintext, key_id: key.id, project_id: project.id, project_slug: project.slug,
    user_email: user.email, user_name: user.name,
    free_tier_limit: Number(process.env.NOETFIELD_FREE_TIER_LIMIT || '100'),
    free_tier_window_days: Number(process.env.NOETFIELD_FREE_TIER_WINDOW_DAYS || '30'),
    verify_endpoint: '/api/v1/verify', docs_url: '/docs',
    curl_example: String.raw`curl -X POST ${origin}/api/v1/verify \
  -H "Authorization: Bearer ${plaintext}" \
  -H "Content-Type: application/json" \
  -d '{"artifact":"// SPDX-License-Identifier: MIT\\nexport function h(){}","artifact_type":"code","metadata":{"source":"cursor","project_id":"${project.id}"}}'`,
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
