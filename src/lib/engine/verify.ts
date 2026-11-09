/**
 * Noetfield Verification Orchestrator
 *
 * Runs G0–G7 in order, computes the deterministic verdict_hash, builds the
 * tamper-proof receipt, and (on PASS) issues the deploy token.
 *
 * Pure function. No DB. The caller persists the result.
 */

import {
  POLICY_HASH,
  POLICY_VERSION,
  gateG0,
  gateG1,
  gateG2,
  gateG3,
  gateG4,
  gateG5,
  gateG6,
  type GateResult,
  type VerifyCtx,
} from './gates'
import { sha256, canonicalJson, hashArtifact, hmacSha256, type ArtifactBundle } from './hash'
import { issueDeployToken, type IssuedToken } from './token'

export interface VerifyInput {
  artifact: string | ArtifactBundle
  artifactType: VerifyCtx['artifactType']
  source: VerifyCtx['source']
  projectId: string
  modelIdentity?: string
  metadata?: Record<string, unknown>
}

export interface VerifyResult {
  artifactHash: string
  verdict: 'pass' | 'fail'
  verdictHash: string
  gates: GateResult[]
  receipt: Record<string, unknown>
  receiptJson: string
  receiptSignature: string
  deployToken: IssuedToken | null
  costUsd: number
  policyHash: string
  policyVersion: number
}

export interface VerifyDeps {
  /** Receives the artifact hash, returns the stored policy hash for POLICY_VERSION. */
  expectedPolicyHash: string
  /** HMAC secret for deploy tokens and receipt signatures. */
  secret: string
  /** Cost per verification in USD — measured at the engine layer, real. */
  costUsdPerVerify: number
  /** Issued-at unix seconds for the deploy token TTL. NOT used in verdict_hash. */
  issuedAtUnix: number
}

/**
 * Run the verification. The verdict_hash is computed deterministically from
 * (project_id, artifact_hash, gate results, policy_hash) — independent of issuedAtUnix.
 */
export function runVerification(input: VerifyInput, deps: VerifyDeps): VerifyResult {
  const artifactStr =
    typeof input.artifact === 'string'
      ? input.artifact
      : canonicalJson(input.artifact)
  const ctx: VerifyCtx = {
    artifactType: input.artifactType,
    source: input.source,
    projectId: input.projectId,
    modelIdentity: input.modelIdentity,
  }

  const artifactHash = hashArtifact(input.artifact)

  // Run gates in order. G7 only issues if G0–G6 all pass.
  const gates: GateResult[] = []
  gates.push(gateG0(ctx))
  gates.push(gateG1(artifactStr))
  gates.push(gateG2(artifactStr))
  gates.push(gateG3(artifactStr, ctx))
  gates.push(gateG4(artifactStr))
  gates.push(gateG5(deps.expectedPolicyHash))
  gates.push(gateG6(input.artifact))

  const hardGates = gates // G0–G6
  const allPassed = hardGates.every((g) => g.passed)
  const verdict: 'pass' | 'fail' = allPassed ? 'pass' : 'fail'

  // Deterministic verdict hash. Sorted gate results by index (already sorted),
  // then concatenated with artifact hash and policy hash.
  const gateDigest = gates
    .map((g) => `${g.name}=${g.passed ? '1' : '0'}`)
    .join(',')
  const verdictHash =
    'sha256:' +
    sha256(`${input.projectId}|${artifactHash}|${gateDigest}|${POLICY_HASH}|v${POLICY_VERSION}`)

  // Deploy token (G7) — only on PASS
  const deployToken = allPassed
    ? issueDeployToken(deps.secret, artifactHash, deps.issuedAtUnix)
    : null

  // G7 gate result for the receipt (always present, marks whether a token was issued)
  const g7: GateResult = {
    name: 'G7 Deploy Token',
    index: 7,
    passed: allPassed,
    detail: allPassed
      ? `Token issued. TTL=${15 * 60}s. Bound to artifact hash ${artifactHash.slice(0, 24)}….`
      : 'No token issued — upstream gates failed.',
    evidence: deployToken ? [deployToken.token.slice(0, 24) + '…'] : undefined,
  }
  gates.push(g7)

  // Build the canonical receipt. Order of keys is fixed by canonicalJson.
  const receipt = {
    schema: 'noetfield.receipt/v1',
    verdict_hash: verdictHash,
    verdict,
    artifact_hash: artifactHash,
    artifact_type: input.artifactType,
    source: input.source,
    project_id: input.projectId,
    model_identity: input.modelIdentity ?? null,
    policy: {
      version: POLICY_VERSION,
      hash: POLICY_HASH,
      expected_hash: deps.expectedPolicyHash,
    },
    gates: gates.map((g) => ({
      index: g.index,
      name: g.name,
      passed: g.passed,
      detail: g.detail,
      evidence: g.evidence ?? null,
    })),
    deploy_token: deployToken
      ? {
          token: deployToken.token,
          expires_at: deployToken.expiresAt,
          expiry_unix: deployToken.expiryUnix,
        }
      : null,
    cost_usd: deps.costUsdPerVerify,
    issued_at_unix: deps.issuedAtUnix,
    metadata: input.metadata ?? null,
  }
  const receiptJson = canonicalJson(receipt)
  const receiptSignature = hmacSha256(deps.secret, receiptJson)

  return {
    artifactHash,
    verdict,
    verdictHash,
    gates,
    receipt,
    receiptJson,
    receiptSignature,
    deployToken,
    costUsd: deps.costUsdPerVerify,
    policyHash: POLICY_HASH,
    policyVersion: POLICY_VERSION,
  }
}

/**
 * Re-verify a receipt's signature. Tamper-evidence: if any byte of
 * receiptJson changes, the signature won't match.
 */
export function verifyReceiptSignature(
  secret: string,
  receiptJson: string,
  signature: string,
): boolean {
  return hmacSha256(secret, receiptJson) === signature
}
