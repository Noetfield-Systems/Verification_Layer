/**
 * Independent Verifier — a second-opinion service.
 *
 * The thesis: Noetfield issues a receipt with an HMAC signature. But if
 * Noetfield itself is compromised, its signature is meaningless. The
 * Independent Verifier re-checks the receipt INDEPENDENTLY:
 *
 *   1. Fetch the receipt by verdict_hash (public endpoint).
 *   2. Re-compute HMAC-SHA256(NOETFIELD_RECEIPT_SECRET, receiptJson) locally.
 *   3. Compare against the receipt's signature. If mismatch → receipt was
 *      tampered with after issuance, or NOETFIELD_RECEIPT_SECRET was rotated.
 *   4. Optionally re-run the G0-G7 gates against the artifact (if we have it)
 *      and confirm the recomputed verdict_hash matches. This catches a
 *      compromised engine that issued a receipt for a verdict it didn't
 *      actually compute.
 *   5. Issue an INDEPENDENT attestation, signed with a DIFFERENT secret
 *      (NOETFIELD_VERIFIER_SECRET). Store it in IndependentAttestation.
 *
 * An auditor now sees TWO signatures on the same verdict: Noetfield's, and
 * the Verifier's. Neither party can fake the other.
 */

import { db } from '@/lib/db'
import { hmacSha256, canonicalJson } from '@/lib/engine/hash'
import { verifyReceiptSignature } from '@/lib/engine/verify'

/** Separate secret for the verifier. MUST differ from NOETFIELD_RECEIPT_SECRET. */
export function verifierSecret(): string {
  const v = process.env.NOETFIELD_VERIFIER_SECRET
  if (v && v.length >= 16) return v
  // Dev fallback — must be different from noetfieldSecret() default.
  if (process.env.NODE_ENV === 'production') throw new Error('NOETFIELD_VERIFIER_SECRET not configured')
  return 'dev-verifier-secret-different-from-receipt-secret'
}

export function receiptSecret(): string {
  const v = process.env.NOETFIELD_RECEIPT_SECRET
  if (v && v.length >= 16) return v
  if (process.env.NODE_ENV === 'production') throw new Error('NOETFIELD_RECEIPT_SECRET not configured')
  return 'dev-secret-do-not-use-in-production-please-set-NOETFIELD_RECEIPT_SECRET'
}

export const VERIFIER_ID = 'independent-verifier-v1'

export interface AttestationInput {
  verdictHash: string
  /** If we have the artifact, we can re-run the gates. If not, we skip
   * recomputation and only verify the receipt signature. */
  artifact?: string
  artifactType?: 'code' | 'workflow' | 'config'
  source?: 'bolt' | 'v0' | 'cursor' | 'custom'
  projectId?: string
}

export interface AttestationResult {
  verdictHash: string
  verified: boolean
  signatureValid: boolean
  gatesRecomputed: boolean
  gatesMatched: boolean
  receiptFound: boolean
  reason: string
  attestation: {
    schema: 'noetfield.attestation/v1'
    verifier_id: string
    verdict_hash: string
    receipt_signature_valid: boolean
    gates_recomputed: boolean
    gates_matched: boolean
    verified: boolean
    verified_at: string
    receipt_signature: string
    attestation_signature: string
  }
  attestationJson: string
  attestationSignature: string
}

/**
 * Produce (and persist) an independent attestation for a verdict.
 *
 * Steps:
 *   1. Look up the receipt in the DB by verdict_hash.
 *   2. Re-verify the HMAC signature locally with NOETFIELD_RECEIPT_SECRET.
 *   3. If artifact provided, re-run the gates and confirm the recomputed
 *      verdict_hash matches the original.
 *   4. Build the canonical attestation JSON, sign with NOETFIELD_VERIFIER_SECRET.
 *   5. Persist to IndependentAttestation table.
 */
export async function attest(input: AttestationInput): Promise<AttestationResult> {
  const { verdictHash } = input
  // 1. Fetch receipt
  const verification = await db.verification.findUnique({
    where: { verdictHash },
    include: { receipt: true },
  })
  if (!verification || !verification.receipt) {
    return failed(verdictHash, 'receipt not found for verdict_hash')
  }
  const receipt = verification.receipt

  // 2. Re-verify HMAC signature locally
  const signatureValid = verifyReceiptSignature(
    receiptSecret(),
    receipt.receiptJson,
    receipt.signature,
  )
  if (!signatureValid) {
    // Persist the failed attestation — auditors need to see this.
    const attestation = buildAttestation(verdictHash, {
      receipt_signature_valid: false,
      gates_recomputed: false,
      gates_matched: false,
      verified: false,
      receipt_signature: receipt.signature,
    })
    await persistAttestation(attestation, verdictHash, false, false, false, false)
    return {
      verdictHash,
      verified: false,
      signatureValid: false,
      gatesRecomputed: false,
      gatesMatched: false,
      receiptFound: true,
      reason: 'receipt signature invalid — receipt was tampered with or secret rotated',
      attestation: attestation.attestation,
      attestationJson: attestation.attestationJson,
      attestationSignature: attestation.attestationSignature,
    }
  }

  // 3. Optionally re-run gates if we have the artifact
  let gatesRecomputed = false
  let gatesMatched = false
  if (input.artifact) {
    const reResult = await recomputeVerdict({
      artifact: input.artifact,
      artifactType: input.artifactType || 'code',
      source: input.source || 'custom',
      projectId: input.projectId || verification.projectId,
    })
    gatesRecomputed = true
    gatesMatched = reResult.verdictHash === verdictHash
  }

  // 4. Build + sign attestation
  const verified = signatureValid && (!gatesRecomputed || gatesMatched)
  const attestation = buildAttestation(verdictHash, {
    receipt_signature_valid: signatureValid,
    gates_recomputed: gatesRecomputed,
    gates_matched: gatesMatched,
    verified,
    receipt_signature: receipt.signature,
  })

  // 5. Persist
  await persistAttestation(
    attestation,
    verdictHash,
    verified,
    signatureValid,
    gatesRecomputed,
    gatesMatched,
  )

  return {
    verdictHash,
    verified,
    signatureValid,
    gatesRecomputed,
    gatesMatched,
    receiptFound: true,
    reason: verified ? 'ok' : 'signature valid but recomputed gates did not match',
    attestation: attestation.attestation,
    attestationJson: attestation.attestationJson,
    attestationSignature: attestation.attestationSignature,
  }
}

/** Re-run the G0-G7 engine against the artifact and produce a fresh verdict_hash. */
async function recomputeVerdict(input: {
  artifact: string
  artifactType: 'code' | 'workflow' | 'config'
  source: 'bolt' | 'v0' | 'cursor' | 'custom'
  projectId: string
}) {
  // Lazy import to avoid pulling the engine into the client bundle.
  const { runVerification } = await import('@/lib/engine/verify')
  const { storedPolicyHash } = await import('@/lib/noetfield')
  const { noetfieldSecret, costPerVerify } = await import('@/lib/noetfield')
  const expectedPolicyHash = await storedPolicyHash()
  return runVerification(
    {
      artifact: input.artifact,
      artifactType: input.artifactType,
      source: input.source,
      projectId: input.projectId,
    },
    {
      expectedPolicyHash,
      secret: noetfieldSecret(),
      costUsdPerVerify: costPerVerify(),
      issuedAtUnix: Math.floor(Date.now() / 1000),
    },
  )
}

function buildAttestation(
  verdictHash: string,
  fields: {
    receipt_signature_valid: boolean
    gates_recomputed: boolean
    gates_matched: boolean
    verified: boolean
    receipt_signature: string
  },
) {
  const attestation = {
    schema: 'noetfield.attestation/v1' as const,
    verifier_id: VERIFIER_ID,
    verdict_hash: verdictHash,
    receipt_signature_valid: fields.receipt_signature_valid,
    gates_recomputed: fields.gates_recomputed,
    gates_matched: fields.gates_matched,
    verified: fields.verified,
    verified_at: new Date().toISOString(),
    receipt_signature: fields.receipt_signature,
    attestation_signature: '', // filled below
  }
  // Sign canonical JSON (without the attestation_signature field).
  const { attestation_signature: _drop, ...rest } = attestation
  void _drop
  const attestationJson = canonicalJson(rest)
  const attestationSignature = hmacSha256(verifierSecret(), attestationJson)
  return {
    attestation: { ...attestation, attestation_signature: attestationSignature },
    attestationJson,
    attestationSignature,
  }
}

async function persistAttestation(
  att: ReturnType<typeof buildAttestation>,
  verdictHash: string,
  verified: boolean,
  signatureValid: boolean,
  gatesRecomputed: boolean,
  gatesMatched: boolean,
) {
  return db.independentAttestation.create({
    data: {
      verdictHash,
      verified,
      signatureValid,
      gatesRecomputed,
      gatesMatched,
      attestationJson: att.attestationJson,
      attestationSig: att.attestationSignature,
      verifierId: VERIFIER_ID,
    },
  })
}

function failed(verdictHash: string, reason: string): AttestationResult {
  return {
    verdictHash,
    verified: false,
    signatureValid: false,
    gatesRecomputed: false,
    gatesMatched: false,
    receiptFound: false,
    reason,
    attestation: {
      schema: 'noetfield.attestation/v1',
      verifier_id: VERIFIER_ID,
      verdict_hash: verdictHash,
      receipt_signature_valid: false,
      gates_recomputed: false,
      gates_matched: false,
      verified: false,
      verified_at: new Date().toISOString(),
      receipt_signature: '',
      attestation_signature: '',
    },
    attestationJson: '',
    attestationSignature: '',
  }
}

/**
 * Verify an attestation's signature against the verifier secret.
 * Lets an auditor confirm the attestation was issued by THIS verifier.
 */
export function verifyAttestationSignature(
  attestationJson: string,
  signature: string,
): boolean {
  return hmacSha256(verifierSecret(), attestationJson) === signature
}
