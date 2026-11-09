/**
 * Determinism smoke test for the Noetfield engine.
 * Run: bun run scripts/test-engine.ts
 *
 * Validates the core thesis: 100 runs of the same artifact produce the
 * same verdict hash, and a perturbed artifact produces a different hash.
 */

import { runVerification, verifyReceiptSignature } from '../src/lib/engine/verify'
import { POLICY_HASH, POLICY_VERSION } from '../src/lib/engine/gates'

const GOOD_ARTIFACT = `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Noetfield Systems
export function handler(req, res) {
  const user = req.body.user;
  return { ok: true, user };
}
`

const SECRET = 'test-secret-1234567890abcdef'
const DEPS = {
  expectedPolicyHash: POLICY_HASH,
  secret: SECRET,
  costUsdPerVerify: 0.0008,
  issuedAtUnix: 1730000000,
}

const INPUT = {
  artifact: GOOD_ARTIFACT,
  artifactType: 'code' as const,
  source: 'cursor' as const,
  projectId: 'proj_test',
  modelIdentity: 'deepseek-coder-v2',
}

// 1. Determinism: 100 runs, same hash
const hashes = new Set<string>()
let firstToken: string | null = null
for (let i = 0; i < 100; i++) {
  const result = runVerification(INPUT, { ...DEPS, issuedAtUnix: 1730000000 + i * 60 })
  hashes.add(result.verdictHash)
  if (i === 0) firstToken = result.deployToken?.token ?? null
}
console.log(`[determinism] distinct verdict hashes across 100 runs: ${hashes.size}`)
if (hashes.size !== 1) {
  console.error('FAIL: verdict hash is not deterministic across runs')
  process.exit(1)
}
const expectedHash = [...hashes][0]
console.log(`[determinism] verdict_hash = ${expectedHash}`)

// 2. Negative control
const perturbed = GOOD_ARTIFACT.replace('Noetfield Systems', 'Noetfield Systems Inc')
const perturbedResult = runVerification({ ...INPUT, artifact: perturbed }, DEPS)
console.log(`[negative-control] perturbed verdict_hash = ${perturbedResult.verdictHash}`)
if (perturbedResult.verdictHash === expectedHash) {
  console.error('FAIL: perturbed artifact produced same hash')
  process.exit(1)
}
console.log('[negative-control] perturbed hash differs from baseline — OK')

// 3. Receipt signature tamper-evidence
const baseResult = runVerification(INPUT, DEPS)
const sigOk = verifyReceiptSignature(SECRET, baseResult.receiptJson, baseResult.receiptSignature)
const tamperedJson = baseResult.receiptJson.replace('"verdict":"pass"', '"verdict":"fail"')
const sigTampered = verifyReceiptSignature(SECRET, tamperedJson, baseResult.receiptSignature)
console.log(`[receipt] valid signature verifies: ${sigOk}`)
console.log(`[receipt] tampered receipt rejected: ${!sigTampered}`)
if (!sigOk || sigTampered) {
  console.error('FAIL: receipt signature tamper-evidence broken')
  process.exit(1)
}

// 4. Token issuance
console.log(`[token] issued: ${firstToken ? 'yes' : 'no'}`)
if (!firstToken) {
  console.error('FAIL: deploy token not issued on PASS')
  process.exit(1)
}

// 5. FAIL artifact
const BAD_ARTIFACT = `const key = "AKIAIOSFODNN7EXAMPLE";
const secret = "aws_secret_access_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'";
process.env.DB_PASSWORD = "supersecret123";
`
const badResult = runVerification(
  {
    artifact: BAD_ARTIFACT,
    artifactType: 'code',
    source: 'bolt',
    projectId: 'proj_test',
  },
  DEPS,
)
console.log(`[fail] verdict=${badResult.verdict} token=${badResult.deployToken ? 'WRONG' : 'null (correct)'}`)
const failedGates = badResult.gates.filter((g) => !g.passed).map((g) => g.name)
console.log(`[fail] failed gates: ${failedGates.join(', ')}`)
if (badResult.verdict !== 'fail' || badResult.deployToken) {
  console.error('FAIL: bad artifact did not produce fail verdict')
  process.exit(1)
}

console.log('\n=== ALL ENGINE TESTS PASSED ===')
console.log(`policy_version=${POLICY_VERSION} policy_hash=${POLICY_HASH.slice(0, 24)}…`)
