/**
 * @noetfield/sdk — Official Noetfield Verification Layer SDK
 *
 * Cryptographic proof that your AI agent's code is safe to deploy.
 *
 * Usage:
 *   import { Noetfield } from '@noetfield/sdk';
 *   const nf = new Noetfield({ apiKey: 'nf_live_...' });
 *   const result = await nf.verify({
 *     artifact: codeString,
 *     artifactType: 'code',
 *     metadata: { source: 'bolt', projectId: 'proj_123' }
 *   });
 *   if (result.verdict === 'pass') {
 *     console.log('Deploy token:', result.deployToken);
 *   }
 */

export type ArtifactType = 'code' | 'workflow' | 'config'
export type ArtifactSource = 'bolt' | 'v0' | 'cursor' | 'custom'
export type Verdict = 'pass' | 'fail'

export interface VerifyMetadata {
  source?: ArtifactSource
  projectId: string
  modelIdentity?: string
  [key: string]: unknown
}

export interface VerifyInput {
  /** The artifact to verify. String for single-file, {path: contents} for multi-file. */
  artifact: string | Record<string, string>
  artifactType?: ArtifactType
  metadata: VerifyMetadata
}

export interface GateResult {
  name: string
  passed: boolean
  detail: string
}

export interface VerifyResult {
  jobId: string
  status: 'complete' | 'pending' | 'processing' | 'failed'
  verdict: Verdict | null
  verdictHash: string | null
  artifactHash: string | null
  gates: GateResult[] | null
  deployToken: string | null
  tokenExpiry: string | null
  costUsd: number | null
  receiptUrl: string | null
  idempotent?: boolean
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

export interface Receipt {
  schema: string
  verdict_hash: string
  verdict: Verdict
  artifact_hash: string
  artifact_type: ArtifactType
  source: ArtifactSource
  project_id: string
  model_identity: string | null
  policy: { version: number; hash: string; expected_hash: string }
  gates: Array<{ index: number; name: string; passed: boolean; detail: string; evidence: string[] | null }>
  deploy_token: { token: string; expires_at: string; expiry_unix: number } | null
  cost_usd: number
  issued_at_unix: number
  metadata: Record<string, unknown> | null
}

export interface ReceiptResponse {
  receipt: Receipt
  signature: string
  signatureAlgorithm: string
  verificationUrl: string
  artifactRef: string | null
  project: { id: string; name: string } | null
  retrievedAt: string
}

export interface NoetfieldOptions {
  apiKey: string
  /** Override the API base URL. Defaults to https://api.noetfield.com */
  baseUrl?: string
  /** Request timeout in ms. Default 30000. */
  timeout?: number
  /** Custom fetch implementation (for test mocking). */
  fetchImpl?: typeof fetch
}

export class NoetfieldError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message)
    this.name = 'NoetfieldError'
  }
}

function defaultBaseUrl(): string {
  // Allow override at runtime via env. Isomorphic-safe: avoids referencing
  // `process` directly so the SDK works in browsers without @types/node.
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const env = g.process?.env
  if (env && env.NOETFIELD_API_URL) return env.NOETFIELD_API_URL
  return 'https://api.noetfield.com'
}

export class Noetfield {
  private apiKey: string
  private baseUrl: string
  private timeout: number
  private fetchImpl: typeof fetch

  constructor(opts: NoetfieldOptions) {
    if (!opts.apiKey || !opts.apiKey.startsWith('nf_live_')) {
      throw new NoetfieldError('apiKey must start with "nf_live_"', 'invalid_api_key', 0)
    }
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl || defaultBaseUrl()).replace(/\/$/, '')
    this.timeout = opts.timeout ?? 30000
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  /**
   * Submit an artifact for verification. Returns the verdict + hash + receipt URL.
   * If the same artifact was verified before, returns the existing receipt (idempotent).
   */
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const body = {
      artifact: input.artifact,
      artifact_type: input.artifactType || 'code',
      metadata: {
        source: input.metadata.source || 'custom',
        project_id: input.metadata.projectId,
        model_identity: input.metadata.modelIdentity,
        ...input.metadata,
      },
    }
    const resp = await this.request('POST', '/api/v1/verify', body)
    const data = await resp.json()
    if (!resp.ok) {
      const err = data?.error || { code: 'unknown', message: 'verification failed' }
      throw new NoetfieldError(err.message, err.code, resp.status)
    }
    return {
      jobId: data.job_id,
      status: data.status,
      verdict: data.verdict,
      verdictHash: data.verdict_hash,
      artifactHash: data.artifact_hash,
      gates: data.gates?.map((g: { name: string; passed: boolean; detail: string }) => ({
        name: g.name,
        passed: g.passed,
        detail: g.detail,
      })),
      deployToken: data.deploy_token,
      tokenExpiry: data.token_expiry,
      costUsd: data.cost_usd,
      receiptUrl: data.receipt_url,
      idempotent: data.idempotent,
    }
  }

  /** Poll a verification job by id. Useful if you switch to the async queue later. */
  async getVerification(jobId: string): Promise<VerifyResult> {
    const resp = await this.request('GET', `/api/v1/verify/${jobId}`)
    const data = await resp.json()
    if (!resp.ok) {
      const err = data?.error || { code: 'unknown', message: 'fetch failed' }
      throw new NoetfieldError(err.message, err.code, resp.status)
    }
    return {
      jobId,
      status: data.status,
      verdict: data.verdict,
      verdictHash: data.verdict_hash,
      artifactHash: data.artifact_hash,
      gates: data.gates,
      deployToken: data.deploy_token,
      tokenExpiry: data.token_expiry,
      costUsd: data.cost_usd,
      receiptUrl: data.receipt_url,
    }
  }

  /** Fetch the full tamper-proof receipt by verdict hash. */
  async getReceipt(verdictHash: string): Promise<ReceiptResponse> {
    const resp = await this.fetchImpl(`${this.baseUrl}/api/v1/receipt/${verdictHash}`)
    const data = await resp.json()
    if (!resp.ok) {
      const err = data?.error || { code: 'unknown', message: 'receipt not found' }
      throw new NoetfieldError(err.message, err.code, resp.status)
    }
    return {
      receipt: data.receipt,
      signature: data.signature,
      signatureAlgorithm: data.signature_algorithm,
      verificationUrl: data.verification_url,
      artifactRef: data.artifact_ref,
      project: data.project,
      retrievedAt: data.retrieved_at,
    }
  }

  /**
   * Verify a deploy token before deploying an artifact. Call this from your
   * Cloudflare/Railway/AWS infrastructure. Returns { valid: true } only if
   * the token is correctly signed, bound to the artifact hash, and unexpired.
   */
  async verifyToken(deployToken: string, artifactHash: string): Promise<TokenVerification> {
    const resp = await this.request('POST', '/api/v1/verify-token', {
      deploy_token: deployToken,
      artifact_hash: artifactHash,
    })
    const data = await resp.json()
    if (!resp.ok) {
      const err = data?.error || { code: 'unknown', message: 'token check failed' }
      throw new NoetfieldError(err.message, err.code, resp.status)
    }
    return {
      valid: data.valid,
      expired: data.expired,
      signatureValid: data.signature_valid,
      artifactHashMatches: data.artifact_hash_matches,
      expiry: data.expiry,
      verdictHash: data.verdict_hash,
      reason: data.reason,
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Convenience: verify an artifact in one call without instantiating the client. */
export async function verify(
  artifact: string | Record<string, string>,
  opts: { apiKey: string; projectId: string; source?: ArtifactSource; artifactType?: ArtifactType; baseUrl?: string },
): Promise<VerifyResult> {
  const nf = new Noetfield({ apiKey: opts.apiKey, baseUrl: opts.baseUrl })
  return nf.verify({
    artifact,
    artifactType: opts.artifactType || 'code',
    metadata: { projectId: opts.projectId, source: opts.source || 'custom' },
  })
}

export default Noetfield
