/**
 * Shared TypeScript types for the Noetfield dashboard.
 * These mirror the shape returned by the dashboard/internal API routes
 * (under /api/dashboard, /api/keys, /api/projects, /api/audit, /api/seed)
 * and the public Phase 1 API (/api/v1/verify, /api/v1/receipt, /api/v1/verify-token).
 */

export type ViewId =
  | 'landing'
  | 'overview'
  | 'verifications'
  | 'detail'
  | 'playground'
  | 'keys'
  | 'projects'
  | 'audit'
  | 'billing'
  | 'integrations'
  | 'docs'

export type Verdict = 'pass' | 'fail' | null | undefined
export type ArtifactType = 'code' | 'workflow' | 'config'
export type Source = 'bolt' | 'v0' | 'cursor' | 'custom'

export interface ProjectRef {
  id: string
  name: string
  slug: string
}

export interface ProjectOwner {
  email: string
  name: string | null
}

export interface ProjectListItem {
  id: string
  name: string
  slug: string
  owner: ProjectOwner
  verification_count: number
  api_key_count: number
  created_at: string
}

export interface SevenDayTrendPoint {
  date: string
  pass: number
  fail: number
  cost: number
}

export interface StatsResponse {
  total: number
  passed: number
  failed: number
  pass_rate: number
  total_cost_usd: number
  today_count: number
  projects_count: number
  seven_day_trend: SevenDayTrendPoint[]
}

export interface VerificationListItem {
  id: string
  project: ProjectRef
  verdict: Verdict
  verdict_hash: string | null
  artifact_hash: string
  artifact_type: ArtifactType
  artifact_ref: string | null
  source: Source
  model_identity: string | null
  cost_usd: number | null
  status: string
  deploy_token: string | null
  token_expiry: string | null
  created_at: string
  completed_at: string | null
}

export interface VerificationsResponse {
  verifications: VerificationListItem[]
  count: number
}

export interface GateResult {
  index: number
  name: string
  passed: boolean
  detail: string
  evidence?: string[] | null
}

export interface ReceiptPayload {
  receipt: Record<string, unknown>
  signature: string
  signature_algorithm: string
  verification_url?: string
  artifact_ref?: string | null
  project?: ProjectRef | null
  retrieved_at?: string
}

export interface VerificationDetail {
  id: string
  project: ProjectRef
  verdict: Verdict
  verdict_hash: string | null
  artifact_hash: string
  artifact_type: ArtifactType
  artifact_ref: string | null
  source: Source
  model_identity: string | null
  cost_usd: number | null
  status: string
  deploy_token: string | null
  token_expiry: string | null
  gates: GateResult[] | null
  metadata: Record<string, unknown> | null
  receipt: ReceiptPayload | null
  created_at: string
  completed_at: string | null
}

export interface AuditEntry {
  id: string
  project_id: string | null
  project?: ProjectRef | null
  actor: string
  action: string
  details: Record<string, unknown> | null
  timestamp: string
}

export interface AuditResponse {
  audit: AuditEntry[]
  count?: number
  exported_at?: string
}

export interface ApiKeyListItem {
  id: string
  name: string
  prefix: string
  project: ProjectRef | null
  scopes: string
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export interface ApiKeysResponse {
  keys: ApiKeyListItem[]
}

export interface ApiKeyCreated {
  id: string
  name: string
  plaintext: string
  prefix: string
  project: { id: string; name: string }
  created_at: string
}

export interface ProjectsListResponse {
  projects: ProjectListItem[]
}

export interface VerifyTokenRequest {
  artifact: string | Record<string, string>
  artifact_type?: ArtifactType
  metadata?: {
    source?: Source
    project_id?: string
    model_identity?: string
    [k: string]: unknown
  }
}

export interface VerifyGateCompact {
  name: string
  passed: boolean
  detail: string
}

export interface VerifyResponse {
  job_id: string
  status: string
  verdict: Verdict
  verdict_hash: string | null
  artifact_hash: string
  gates: VerifyGateCompact[]
  deploy_token: string | null
  token_expiry: string | null
  cost_usd: number | null
  receipt_url: string | null
}

export interface VerifyTokenResponse {
  valid: boolean
  expired: boolean
  signature_valid: boolean
  artifact_hash_matches?: boolean
  expiry: string | null
  verdict_hash: string | null
  reason: string
  checked_at?: string
}

export interface SeedResponse {
  ok: boolean
  user: { email: string; name: string | null }
  project: ProjectRef
  api_key: { plaintext: string; prefix: string; name: string } | { plaintext: string; prefix: string; name: string }
  sample_count: number
}
