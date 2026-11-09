/**
 * G7 — Deploy Token
 *
 * On PASS, Noetfield issues a short-lived HMAC token bound to the artifact
 * hash. Infrastructure (Cloudflare, Railway, AWS) calls /api/v1/verify-token
 * to check the token before deploying the artifact.
 *
 * Token format:  nf_tok_<version>.<expiryUnix>.<hmacHex>
 *   - version: policy version (so a policy bump invalidates old tokens)
 *   - expiryUnix: seconds since epoch when the token expires
 *   - hmacHex: HMAC-SHA256(secret, artifact_hash + "|" + expiryUnix + "|" + version)
 *
 * Bound to artifact_hash: re-computing the HMAC with a different hash fails.
 * 15-minute TTL (configurable in POLICY_CONFIG.tokenTtlSeconds).
 */

import { hmacSha256 } from './hash'
import { POLICY_CONFIG, POLICY_VERSION } from './gates'

const TOKEN_PREFIX = 'nf_tok'

export interface IssuedToken {
  token: string
  expiryUnix: number
  expiresAt: string // ISO
}

export function issueDeployToken(
  secret: string,
  artifactHash: string,
  issuedAtUnix: number,
): IssuedToken {
  const expiryUnix = issuedAtUnix + POLICY_CONFIG.tokenTtlSeconds
  const payload = `${artifactHash}|${expiryUnix}|${POLICY_VERSION}`
  const mac = hmacSha256(secret, payload)
  return {
    token: `${TOKEN_PREFIX}_${POLICY_VERSION}.${expiryUnix}.${mac}`,
    expiryUnix,
    expiresAt: new Date(expiryUnix * 1000).toISOString(),
  }
}

export interface TokenVerification {
  valid: boolean
  expired: boolean
  signatureValid: boolean
  artifactHashMatches: boolean
  expiry: string | null
  verdictHash: string | null
  reason: string
}

/**
 * Verify a deploy token presented by infrastructure.
 * `expectedArtifactHash` is the hash of the artifact the infrastructure is
 * about to deploy. The token is only valid if it was issued for the same hash.
 */
export function verifyDeployToken(
  secret: string,
  token: string,
  expectedArtifactHash: string,
  nowUnix: number,
  verdictHashLookup?: (artifactHash: string) => string | null,
): TokenVerification {
  const parts = token.split(/[_.]/)
  // Expect: nf_tok_<version>.<expiry>.<hmac>  → after split on _ and .:
  // ['nf', 'tok', '<version>', '<expiry>', '<hmac>']
  if (parts.length !== 5 || parts[0] !== 'nf' || parts[1] !== 'tok') {
    return {
      valid: false,
      expired: false,
      signatureValid: false,
      artifactHashMatches: false,
      expiry: null,
      verdictHash: null,
      reason: 'malformed token',
    }
  }
  const version = Number(parts[2])
  const expiry = Number(parts[3])
  const mac = parts[4]
  if (!Number.isFinite(version) || !Number.isFinite(expiry)) {
    return {
      valid: false,
      expired: false,
      signatureValid: false,
      artifactHashMatches: false,
      expiry: null,
      verdictHash: null,
      reason: 'non-numeric version or expiry',
    }
  }
  if (version !== POLICY_VERSION) {
    return {
      valid: false,
      expired: false,
      signatureValid: false,
      artifactHashMatches: false,
      expiry: new Date(expiry * 1000).toISOString(),
      verdictHash: null,
      reason: `policy version mismatch: token v${version}, engine v${POLICY_VERSION}`,
    }
  }
  const expectedMac = hmacSha256(secret, `${expectedArtifactHash}|${expiry}|${version}`)
  const signatureValid = expectedMac === mac
  const expired = nowUnix > expiry
  const artifactHashMatches = signatureValid // signature already binds hash
  const verdictHash = verdictHashLookup ? verdictHashLookup(expectedArtifactHash) : null
  const valid = signatureValid && !expired
  return {
    valid,
    expired,
    signatureValid,
    artifactHashMatches,
    expiry: new Date(expiry * 1000).toISOString(),
    verdictHash,
    reason: valid
      ? 'ok'
      : !signatureValid
        ? 'signature does not match artifact hash'
        : 'token expired',
  }
}

export const DEPLOY_TOKEN_PREFIX = TOKEN_PREFIX
