/**
 * Noetfield server-side config + auth helpers.
 *
 * Secrets are read from environment variables. On Railway they are set
 * as service variables. In development they fall back
 * to deterministic values so the sandbox boots without configuration.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { POLICY_CONFIG, POLICY_HASH, POLICY_VERSION } from '@/lib/engine/gates'

/** HMAC secret for deploy tokens + receipt signatures. */
export function noetfieldSecret(): string {
  const v = process.env.NOETFIELD_RECEIPT_SECRET
  if (v && v.length >= 16) return v
  if (process.env.NODE_ENV === 'production') throw new Error('NOETFIELD_RECEIPT_SECRET missing or too short')
  return 'dev-secret-do-not-use-in-production-please-set-NOETFIELD_RECEIPT_SECRET'
}

/** Configured per-verification cost estimate; not metered provider spend. */
export function costPerVerify(): number {
  const v = Number(process.env.NOETFIELD_COST_PER_VERIFY_USD || '')
  if (Number.isFinite(v) && v >= 0) return v
  // Default is illustrative only. This is not metered infrastructure spend.
  return 0.0008
}

/**
 * Hash an API key for storage. We never store the plaintext key.
 * SHA-256 with a per-deployment pepper so a DB leak alone is not enough.
 */
export function hashApiKey(plaintext: string): string {
  const pepper = noetfieldSecret()
  return createHash('sha256').update(pepper + ':' + plaintext, 'utf8').digest('hex')
}

/** Generate a new plaintext API key. Format: nf_live_<48 hex>. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(24)
  // crypto.webcrypto.getRandomValues is available in Node 19+ and workerd.
  // Fallback to Node crypto for older runtimes.
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto')
    const buf = nodeCrypto.randomBytes(24)
    for (let i = 0; i < bytes.length; i++) bytes[i] = buf[i]
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `nf_live_${hex}`
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Resolve an API key from the request header. Returns the ApiKey row + the
 * project it belongs to. Throws on missing/revoked/invalid.
 */
export async function resolveApiKey(headerValue: string | null | undefined) {
  const plaintext = headerValue?.replace(/^Bearer\s+/i, '').trim() || ''
  if (!/^nf_live_[0-9a-f]{48}$/.test(plaintext)) {
    throw new ApiKeyError('missing or malformed Authorization header (expected Bearer nf_live_…)')
  }
  const keyHash = hashApiKey(plaintext)
  const row = await db.apiKey.findUnique({
    where: { keyHash },
    include: { project: true },
  })
  if (!row) throw new ApiKeyError('invalid api key')
  if (row.revokedAt) throw new ApiKeyError('api key has been revoked')
  // Update lastUsedAt — best effort, do not block.
  void db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => { /* best-effort metadata update */ })
  return row
}

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiKeyError'
  }
}

/**
 * Bootstrap the engine policy row. Called at server boot. Idempotent —
 * if a row for this version already exists with this hash, no-op.
 */
export async function ensurePolicyBootstrap() {
  const existing = await db.enginePolicy.findUnique({ where: { version: POLICY_VERSION } })
  if (existing) {
    if (existing.policyHash !== POLICY_HASH) {
      // Critical: the running code's policy hash disagrees with the DB.
      // We do NOT auto-fix this — it's a tamper signal. Surface in logs.
      console.error(
        `[noetfield] POLICY TAMPER DETECTED. version=${POLICY_VERSION} ` +
          `running=${POLICY_HASH.slice(0, 16)} stored=${existing.policyHash.slice(0, 16)}`,
      )
    }
    return existing
  }
  return db.enginePolicy.create({
    data: {
      version: POLICY_VERSION,
      policyHash: POLICY_HASH,
      config: JSON.stringify(POLICY_CONFIG),
    },
  })
}

/**
 * Read the stored policy hash for the current version. Used by G5 at
 * verification time. If the row is missing we treat the running hash as
 * authoritative on first boot.
 */
export async function storedPolicyHash(): Promise<string> {
  const row = await db.enginePolicy.findUnique({ where: { version: POLICY_VERSION } })
  return row?.policyHash ?? POLICY_HASH
}

export { POLICY_CONFIG, POLICY_HASH, POLICY_VERSION }
