/**
 * Noetfield Deterministic Hashing
 *
 * The core invariant: the same artifact + the same policy MUST produce the
 * same verdict_hash on every run, in every runtime (Node, workerd, Cloudflare).
 * Therefore:
 *  - No Date.now(), Math.random(), or process.hrtime() inside hashing.
 *  - No iteration over object keys without sorting.
 *  - No encoding that varies by platform (use UTF-8 explicitly).
 *  - SHA-256 only (Node `crypto` and WebCrypto both implement it identically).
 *
 * The verdict_hash is the cryptographic fingerprint stakeholders compare to
 * prove a verification was not tampered with.
 */

import { createHash, createHmac } from 'crypto'

/**
 * Canonical SHA-256 of a UTF-8 string. Hex output, lowercase.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Canonical JSON: keys sorted at every level, no whitespace, UTF-8.
 * This is the only safe way to hash structured data deterministically.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  )
}

/**
 * Hash the artifact. Two shapes are supported:
 *  - string  -> sha256(utf8 bytes)
 *  - { path: contents, ... } (multi-file bundle) -> sha256(canonical_json(sorted))
 *
 * G6 (unordered commit lock) is enforced here: file ordering does not affect
 * the hash because we sort paths before serializing.
 */
export type ArtifactBundle = Record<string, string>

export function hashArtifact(artifact: string | ArtifactBundle): string {
  if (typeof artifact === 'string') {
    return 'sha256:' + sha256(artifact)
  }
  const normalized: ArtifactBundle = {}
  for (const key of Object.keys(artifact).sort()) {
    normalized[key] = artifact[key].replace(/\r\n/g, '\n')
  }
  return 'sha256:' + sha256(canonicalJson(normalized))
}

/**
 * HMAC-SHA256 hex. Used for deploy tokens (G7) and receipt signatures.
 */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}
