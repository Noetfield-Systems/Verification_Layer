/**
 * Noetfield G0-G7 Gate Definitions
 *
 * Each gate is a pure function: (artifact, ctx) -> GateResult.
 * Gates MUST be deterministic. They MUST NOT touch the system clock,
 * random sources, or external network. The only allowed inputs are the
 * artifact text and the immutable policy config.
 *
 * The policy config below is the canonical G5 reference. Its hash is
 * recorded in the EnginePolicy table at boot. If anyone edits a regex,
 * the policy hash changes and every verification receipt that depends
 * on it is invalidated.
 */

import { sha256, canonicalJson } from './hash'

export type ArtifactType = 'code' | 'workflow' | 'config'

export interface VerifyCtx {
  artifactType: ArtifactType
  source: string // bolt | v0 | cursor | custom
  projectId: string
  modelIdentity?: string
}

export interface GateResult {
  name: string
  index: number
  passed: boolean
  detail: string
  /** Evidence sub-items, e.g. the specific line that triggered a failure. */
  evidence?: string[]
}

/**
 * Canonical policy. ANY change here changes POLICY_HASH and breaks every
 * existing receipt — by design. Bump `version` and store a new row in
 * EnginePolicy when you legitimately change the rules.
 */
export const POLICY_VERSION = 1

export const POLICY_CONFIG = {
  version: POLICY_VERSION,
  allowedSources: ['bolt', 'v0', 'cursor', 'custom'],
  allowedArtifactTypes: ['code', 'workflow', 'config'],
  // G1 — direct production DB / hardcoded secrets
  prodDbPatterns: [
    /postgres:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/i,
    /mongodb(\+srv)?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/i,
    /mysql:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/i,
    /redis:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/i,
  ],
  hardcodedSecretPatterns: [
    /\b(AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD|PROD_DB_PASSWORD)\s*=\s*["'`][^"'`]{8,}["'`]/i,
  ],
  // G2 — cloud provider credentials
  credentialPatterns: [
    { label: 'AWS Access Key ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { label: 'AWS Secret Access Key', re: /\baws_secret_access_key\s*=\s*["'][A-Za-z0-9/+=]{40}["']/i },
    { label: 'GCP Service Account JSON', re: /"type"\s*:\s*"service_account"/ },
    { label: 'Stripe Live Secret', re: /\bsk_live_[A-Za-z0-9]{24,}\b/ },
    { label: 'GitHub Personal Access Token', re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
    { label: 'Slack Token', re: /\bxox[baprs]-[A-Za-z0-9-]+\b/ },
    { label: 'Google API Key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  ],
  // G3 — licenses
  licenseSpdxIds: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'GPL-3.0', 'GPL-2.0', 'MPL-2.0', 'ISC', 'Unlicense'],
  licenseFileNames: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'NOTICE'],
  // G4 — transform fidelity
  maxArtifactBytes: 5 * 1024 * 1024,
  // G7 — deploy token
  tokenTtlSeconds: 15 * 60,
}

/**
 * Hash of the canonical policy. This is the G5 reference: if the running
 * code's policy hash does not match the stored policy hash for this
 * version, G5 fails.
 */
export const POLICY_HASH = sha256(canonicalJson(POLICY_CONFIG))

// ---------------------------------------------------------------------------
// Gate implementations
// ---------------------------------------------------------------------------

function linesContaining(artifact: string, predicate: (line: string) => boolean): string[] {
  return artifact.split('\n').filter(predicate)
}

/** G0 — Provenance. Where did this code come from? */
export function gateG0(ctx: VerifyCtx): GateResult {
  const allowed = POLICY_CONFIG.allowedSources.includes(ctx.source)
  const allowedType = POLICY_CONFIG.allowedArtifactTypes.includes(ctx.artifactType)
  const passed = allowed && allowedType
  return {
    name: 'G0 Provenance',
    index: 0,
    passed,
    detail: passed
      ? `Source "${ctx.source}" and type "${ctx.artifactType}" are recognized origins.`
      : `Unrecognized source "${ctx.source}" or type "${ctx.artifactType}". Allowed sources: ${POLICY_CONFIG.allowedSources.join(', ')}.`,
    evidence: passed ? undefined : [`source=${ctx.source}`, `artifact_type=${ctx.artifactType}`],
  }
}

/** G1 — Policy gate. No direct prod DB, no hardcoded secrets. */
export function gateG1(artifact: string): GateResult {
  const hits: string[] = []
  for (const re of POLICY_CONFIG.prodDbPatterns) {
    const m = artifact.match(re)
    if (m) hits.push(`production database connection string: ${m[0].slice(0, 40)}…`)
  }
  for (const re of POLICY_CONFIG.hardcodedSecretPatterns) {
    const m = artifact.match(re)
    if (m) hits.push(`hardcoded secret assignment: ${m[0].slice(0, 50)}`)
  }
  return {
    name: 'G1 Policy',
    index: 1,
    passed: hits.length === 0,
    detail:
      hits.length === 0
        ? 'No direct production DB URLs or hardcoded secret assignments detected.'
        : `${hits.length} policy violation(s) found.`,
    evidence: hits.length ? hits.slice(0, 5) : undefined,
  }
}

/** G2 — Credential gate. Detect AWS/GCP/Stripe/etc. Escalate to human. */
export function gateG2(artifact: string): GateResult {
  const hits: string[] = []
  for (const p of POLICY_CONFIG.credentialPatterns) {
    const m = artifact.match(p.re)
    if (m) hits.push(`${p.label}: ${m[0].slice(0, 24)}…`)
  }
  return {
    name: 'G2 Credential',
    index: 2,
    passed: hits.length === 0,
    detail:
      hits.length === 0
        ? 'No cloud provider or third-party API credentials detected.'
        : `${hits.length} leaked credential(s) detected — requires human review.`,
    evidence: hits.length ? hits.slice(0, 5) : undefined,
  }
}

/** G3 — License gate. Proper license present. */
export function gateG3(artifact: string, ctx: VerifyCtx): GateResult {
  // Code artifact: look for SPDX identifier or license header in the source.
  const text = artifact
  const hasSpdx = POLICY_CONFIG.licenseSpdxIds.some((id) =>
    new RegExp(`SPDX-License-Identifier:\\s*${id.replace('-', '\\-')}`).test(text),
  )
  const hasLicenseHeader = /Copyright\s+\(c\)\s+\d{4}/i.test(text) || /Licensed under the/i.test(text)
  // For workflow/config artifacts we relax: license is enforced at the project level, not per-file.
  const relaxed = ctx.artifactType !== 'code'
  const passed = relaxed || hasSpdx || hasLicenseHeader
  return {
    name: 'G3 License',
    index: 3,
    passed,
    detail: passed
      ? relaxed
        ? `License gate relaxed for ${ctx.artifactType} artifact (enforced at project level).`
        : 'SPDX identifier or copyright/license header found in source.'
      : 'No SPDX-License-Identifier or recognizable license header found in source.',
    evidence: passed ? undefined : ['Add: SPDX-License-Identifier: MIT', 'or a Copyright (c) <year> header'],
  }
}

/** G4 — Transform fidelity. Code wasn't mangled in transit. */
export function gateG4(artifact: string): GateResult {
  const reasons: string[] = []
  if (artifact.length > POLICY_CONFIG.maxArtifactBytes) {
    reasons.push(`artifact exceeds ${POLICY_CONFIG.maxArtifactBytes} bytes`)
  }
  // Replacement char means UTF-8 was decoded with errors.
  if (artifact.includes('\uFFFD')) reasons.push('contains U+FFFD replacement character (encoding corruption)')
  // Non-printable control chars except \n \r \t
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(artifact)) reasons.push('contains non-printable control characters')
  // Bracket balance (rough — counts only, does not parse)
  const open = (artifact.match(/[(\[{]/g) || []).length
  const close = (artifact.match(/[)\]}]/g) || []).length
  if (open !== close) {
    reasons.push(`bracket imbalance: ${open} opening vs ${close} closing delimiters`)
  }
  // Empty artifact
  if (artifact.trim().length === 0) reasons.push('artifact is empty')
  return {
    name: 'G4 Transform Fidelity',
    index: 4,
    passed: reasons.length === 0,
    detail: reasons.length === 0 ? 'Artifact passed encoding, size, and bracket-balance checks.' : `${reasons.length} fidelity issue(s).`,
    evidence: reasons.length ? reasons.slice(0, 5) : undefined,
  }
}

/**
 * G5 — Policy immutability. Rules weren't tampered with.
 *
 * The caller passes `expectedPolicyHash` (read from EnginePolicy at boot,
 * for POLICY_VERSION). If the running code's POLICY_HASH does not match,
 * the gate fails — this is the tamper-evidence signal.
 */
export function gateG5(expectedPolicyHash: string): GateResult {
  const passed = expectedPolicyHash === POLICY_HASH
  return {
    name: 'G5 Policy Immutability',
    index: 5,
    passed,
    detail: passed
      ? `Running policy hash matches stored hash for version ${POLICY_VERSION}.`
      : `POLICY HASH MISMATCH. Running=${POLICY_HASH.slice(0, 16)}… Stored=${expectedPolicyHash.slice(0, 16)}…. The verification rules have been tampered with.`,
    evidence: [POLICY_HASH, expectedPolicyHash],
  }
}

/**
 * G6 — Unordered commit lock. File ordering doesn't matter.
 *
 * The invariant is enforced inside hashArtifact (we sort keys before
 * serializing). This gate simply records the canonicalization step in the
 * receipt so auditors can see it was applied.
 */
export function gateG6(artifact: string | Record<string, string>): GateResult {
  const isBundle = typeof artifact !== 'string' && artifact !== null && typeof artifact === 'object'
  const fileCount = isBundle ? Object.keys(artifact).length : 1
  return {
    name: 'G6 Unordered Commit Lock',
    index: 6,
    passed: true,
    detail: isBundle
      ? `Bundle of ${fileCount} files canonicalized with sorted paths before hashing.`
      : 'Single-file artifact; ordering canonicalization is a no-op.',
    evidence: isBundle ? Object.keys(artifact).sort().slice(0, 8) : undefined,
  }
}

// ---------------------------------------------------------------------------
// G7 — Deploy Token. Implemented in token.ts because it needs the secret.
// ---------------------------------------------------------------------------
