'use client'

/**
 * TanStack Query hooks for the Noetfield dashboard.
 *
 * Every hook calls a relative path (per the sandbox gateway contract).
 * List-y hooks (stats, verifications) auto-refetch every 30s so the
 * dashboard feels alive.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { useDashboardStore } from './dashboard-store'
import type {
  ApiKeysResponse,
  ApiKeyCreated,
  AuditResponse,
  ProjectsListResponse,
  StatsResponse,
  VerificationsResponse,
  VerificationDetail,
  ReceiptPayload,
  VerifyResponse,
  VerifyTokenRequest,
  VerifyTokenResponse,
  Source,
  ArtifactType,
} from './dashboard-types'

// ---------------------------------------------------------------------------
// Low-level fetchers
// ---------------------------------------------------------------------------

/** Read the cached API key from the store at call-time (not import-time)
 * so signup updates are picked up immediately. Uses getState() for
 * synchronous reads — localStorage would race with the persist middleware
 * on the first render after signup. */
function getCachedApiKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    // Prefer the synchronous store state — always current.
    return useDashboardStore.getState()?.apiKey ?? null
  } catch {
    return null
  }
}

function authHeaders(): Record<string, string> {
  const key = getCachedApiKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} — ${txt.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.headers || {}), ...authHeaders() } })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} — ${txt.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Seed (called once on mount)
// ---------------------------------------------------------------------------

export function useSeed() {
  const setApiKey = useDashboardStore((s) => s.setApiKey)
  const setSeeded = useDashboardStore((s) => s.setSeeded)
  const seeded = useDashboardStore((s) => s.seeded)

  return useMutation({
    mutationKey: ['seed'],
    mutationFn: () =>
      postJson<{
        ok: boolean
        api_key?: { plaintext: string; prefix: string; name: string }
      }>('/api/seed', {}),
    onSuccess: (data) => {
      // If the seed call created a fresh key, persist its plaintext so the
      // Verify Playground can call /api/v1/verify without re-creating one.
      if (data.api_key && data.api_key.plaintext.startsWith('nf_live_')) {
        setApiKey(data.api_key.plaintext)
      }
      setSeeded(true)
    },
  })
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function useStats() {
  // Include the cached API key in the queryKey so the cache invalidates
  // when the user signs up (key changes from null → nf_live_…). Without
  // this, the demo-mode stats from the landing page's SocialProofStrip
  // would be returned after signup instead of refetching.
  const apiKey = useDashboardStore((s) => s.apiKey)
  return useQuery<StatsResponse>({
    queryKey: ['stats', apiKey],
    queryFn: () => postJson<StatsResponse>('/api/dashboard', { action: 'stats' }),
    enabled: !!apiKey,
    refetchInterval: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Verifications list
// ---------------------------------------------------------------------------

export interface VerificationsFilter {
  projectId?: string | null
  verdict?: 'pass' | 'fail' | null
  limit?: number
}

export function useVerifications(filter: VerificationsFilter = {}) {
  // Always call the store hook unconditionally (rules-of-hooks).
  const storeProjectId = useDashboardStore((s) => s.selectedProjectId)
  const apiKey = useDashboardStore((s) => s.apiKey)
  const projectId = filter.projectId ?? storeProjectId
  const verdict = filter.verdict ?? undefined
  return useQuery<VerificationsResponse>({
    queryKey: ['verifications', { projectId, verdict, limit: filter.limit ?? 200, apiKey }],
    queryFn: () =>
      postJson<VerificationsResponse>('/api/dashboard', {
        action: 'verifications',
        projectId: projectId ?? undefined,
        verdict,
        limit: filter.limit ?? 200,
      }),
    refetchInterval: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Single verification detail
// ---------------------------------------------------------------------------

export function useVerificationDetail(id: string | null) {
  const apiKey = useDashboardStore((s) => s.apiKey)
  return useQuery<VerificationDetail>({
    queryKey: ['verification', id, apiKey],
    queryFn: () => {
      if (!id) throw new Error('no id')
      return postJson<VerificationDetail>('/api/dashboard', {
        action: 'single',
        verificationId: id,
      })
    },
    enabled: !!id && !!apiKey,
  })
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export function useApiKeys() {
  const apiKey = useDashboardStore((s) => s.apiKey)
  return useQuery<ApiKeysResponse>({
    queryKey: ['keys', apiKey],
    queryFn: () => postJson<ApiKeysResponse>('/api/keys', { action: 'list' }),
  })
}

export function useCreateKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; projectId?: string }) =>
      postJson<ApiKeyCreated>('/api/keys', {
        action: 'create',
        name: vars.name,
        projectId: vars.projectId,
      }),
    onSuccess: (data) => {
      // Do NOT replace the authenticated dashboard credential with a
      // narrower verify-only key; the plaintext is shown once in the UI.
      void data
      qc.invalidateQueries({ queryKey: ['keys'] })
    },
  })
}

export function useRevokeKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      postJson<{ ok: boolean; revoked: string }>('/api/keys', {
        action: 'revoke',
        id,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  })
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function useProjects() {
  const apiKey = useDashboardStore((s) => s.apiKey)
  return useQuery<ProjectsListResponse>({
    queryKey: ['projects', apiKey],
    enabled: !!apiKey,
    queryFn: () => postJson<ProjectsListResponse>('/api/projects', { action: 'list' }),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; slug?: string }) =>
      postJson<{ id: string; name: string; slug: string; created_at: string }>(
        '/api/projects',
        { action: 'create', name: vars.name, slug: vars.slug },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Audit log (POST /api/dashboard {action:'audit'})
// ---------------------------------------------------------------------------

export function useAudit(projectId?: string | null, limit = 200) {
  return useQuery<AuditResponse>({
    queryKey: ['audit', { projectId, limit }],
    queryFn: () =>
      postJson<AuditResponse>('/api/dashboard', {
        action: 'audit',
        projectId: projectId ?? undefined,
        limit,
      }),
  })
}

// Flat GET /api/audit export (used by the CSV/JSON export buttons).
export async function fetchAuditExport(projectId?: string | null, limit = 1000) {
  const qs = new URLSearchParams()
  if (projectId) qs.set('projectId', projectId)
  qs.set('limit', String(limit))
  return getJson<AuditResponse>(`/api/audit?${qs.toString()}`)
}

// ---------------------------------------------------------------------------
// Public API: verify
// ---------------------------------------------------------------------------

export interface VerifyArgs {
  apiKey: string
  artifact: string
  artifactType: ArtifactType
  source: Source
  projectId: string
  modelIdentity?: string
}

export async function callVerify(args: VerifyArgs): Promise<VerifyResponse> {
  const body: VerifyTokenRequest = {
    artifact: args.artifact,
    artifact_type: args.artifactType,
    metadata: {
      source: args.source,
      project_id: args.projectId,
      ...(args.modelIdentity ? { model_identity: args.modelIdentity } : {}),
    },
  }
  const res = await fetch('/api/v1/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const errMsg =
      (json as { error?: { message?: string; code?: string } })?.error?.message ||
      (json as { error?: string })?.error ||
      `verify failed (${res.status})`
    throw new Error(errMsg)
  }
  return json as VerifyResponse
}

// ---------------------------------------------------------------------------
// Public API: receipt lookup + signature check
// ---------------------------------------------------------------------------

export async function fetchReceipt(verdictHash: string): Promise<ReceiptPayload> {
  return getJson<ReceiptPayload>(`/api/v1/receipt/${encodeURIComponent(verdictHash)}`)
}

export function useVerifyReceipt(verdictHash: string | null, enabled = true) {
  return useQuery<ReceiptPayload>({
    queryKey: ['receipt', verdictHash, useDashboardStore.getState().apiKey],
    queryFn: () => {
      if (!verdictHash) throw new Error('no verdict hash')
      return fetchReceipt(verdictHash)
    },
    enabled: !!verdictHash && enabled,
  })
}

// ---------------------------------------------------------------------------
// Public API: deploy token verify
// ---------------------------------------------------------------------------

export async function callVerifyToken(
  deployToken: string,
  artifactHash: string,
): Promise<VerifyTokenResponse> {
  return postJson<VerifyTokenResponse>('/api/v1/verify-token', {
    deploy_token: deployToken,
    artifact_hash: artifactHash,
  })
}

// ---------------------------------------------------------------------------
// Resolve a usable API key for the Verify Playground.
//
// Strategy:
//   1. If the store already has one (from seed or a previous create), use it.
//   2. Otherwise list existing keys; if any exists, we don't have its
//      plaintext, so create a new "Playground Key".
//   3. Persist the new plaintext to the store.
// ---------------------------------------------------------------------------

export async function ensurePlaygroundApiKey(): Promise<string> {
  const store = useDashboardStore.getState()
  if (store.apiKey && store.apiKey.startsWith('nf_live_')) return store.apiKey

  const listed = await postJson<ApiKeysResponse>('/api/keys', { action: 'list' })
  // We can't recover the plaintext of an existing key — so if no keys exist
  // OR if all keys are revoked, we create a fresh one. Otherwise we still
  // create one (the playground needs the plaintext). This is fine for demo.
  const created = await postJson<ApiKeyCreated>('/api/keys', {
    action: 'create',
    name: `Playground Key ${new Date().toISOString().slice(0, 10)}`,
    projectId: listed.keys[0]?.project?.id,
  })
  store.setApiKey(created.plaintext)
  return created.plaintext
}

// ---------------------------------------------------------------------------
// Resolve the first project id (used by the playground as a default).
// ---------------------------------------------------------------------------

export function useFirstProjectId() {
  const q = useProjects()
  return {
    projectId: q.data?.projects[0]?.id ?? null,
    isLoading: q.isLoading,
    error: q.error,
  }
}

// ---------------------------------------------------------------------------
// Optional hook helper: typed query for the typed response
// ---------------------------------------------------------------------------

export function useTypedQuery<T>(key: unknown[], fn: () => Promise<T>, opts?: UseQueryOptions<T>) {
  return useQuery<T>({ queryKey: key, queryFn: fn, ...opts })
}
