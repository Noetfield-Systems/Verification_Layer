# Phase 4 — Sina Founder OS Integration

The verification API shipped in this build is the contract Sina calls into. This doc describes the integration loop and the contract surface.

## The Loop

```
1. Sina reads business evidence from Supabase
2. DeepSeek proposes a code change (NextActionCandidate)
3. Sina sends the proposed code to Noetfield Verification API
   POST /api/v1/verify
   { artifact: candidateCode, artifact_type: "code",
     metadata: { source: "cursor", project_id: "proj_sina", model_identity: "deepseek-coder-v2" } }
4. If FAIL → Sina asks DeepSeek to fix and retry (max 3 attempts)
   - Feed result.gates[].detail back to DeepSeek as feedback
   - Resubmit the revised candidate
   - Track attempt count in Sina's memory
5. If PASS → Sina receives result.deploy_token
6. Sina creates a GitHub branch with the verified code
   - Branch name: sina/verified-<verdict_hash.slice(7,19)>
   - Commit message includes verdict_hash + receipt_url
7. Independent verifier checks the branch
   - GET /api/v1/receipt/<verdict_hash> — public, no auth
   - Verify the HMAC signature locally
   - Confirm the artifact_hash matches the deployed code
8. Receipt recorded in Sina's memory
   - Store verdict_hash, artifact_hash, gates, cost, timestamp
9. WITHOUT new prompt, Sina selects next action from the result
   - The verdict + receipt IS the feedback signal
   - Next action selection is driven by the verification outcome
```

## Contract surface (what Sina calls)

| Step | HTTP | Endpoint | Body / Params |
|---|---|---|---|
| 3 | POST | `/api/v1/verify` | `{ artifact, artifact_type, metadata: { source, project_id, model_identity } }` |
| 3 (poll) | GET | `/api/v1/verify/:job_id` | — |
| 7 | GET | `/api/v1/receipt/:verdict_hash` | public |
| 7 (token check) | POST | `/api/v1/verify-token` | `{ deploy_token, artifact_hash }` |

Auth: `Authorization: Bearer nf_live_…` (issued via the dashboard or `POST /api/keys`).

## Sina adapter (TypeScript, drop-in)

```typescript
// sina-noetfield-adapter.ts
import { Noetfield, NoetfieldError, type VerifyResult } from '@noetfield/sdk'

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY! })

/** Run a candidate through Noetfield with up to 3 fix-retry attempts. */
export async function verifyCandidate(
  candidate: string,
  fixWithDeepSeek: (failedGates: VerifyResult['gates'], attempt: number) => Promise<string>,
  maxAttempts = 3,
): Promise<{ result: VerifyResult; attempts: number }> {
  let attempts = 0
  let code = candidate
  let result: VerifyResult
  do {
    attempts++
    try {
      result = await nf.verify({
        artifact: code,
        artifactType: 'code',
        metadata: {
          projectId: process.env.NOETFIELD_PROJECT_ID!,
          source: 'cursor',
          modelIdentity: 'deepseek-coder-v2',
        },
      })
    } catch (e) {
      if (e instanceof NoetfieldError) {
        // Network / auth error — don't retry, surface to Sina
        throw e
      }
      throw e
    }
    if (result.verdict === 'pass') {
      return { result, attempts }
    }
    if (attempts >= maxAttempts) {
      return { result, attempts }
    }
    // Feed failed gates back to DeepSeek for a fix
    const failedGates = result.gates?.filter((g) => !g.passed)
    code = await fixWithDeepSeek(failedGates, attempts)
  } while (true)
}

/** Record the receipt in Sina's memory after a successful deploy. */
export async function recordReceiptInMemory(verdictHash: string, sinaMemory: any) {
  const receipt = await nf.getReceipt(verdictHash)
  await sinaMemory.append({
    type: 'noetfield.receipt',
    verdict_hash: verdictHash,
    artifact_hash: receipt.receipt.artifact_hash,
    gates: receipt.receipt.gates,
    cost_usd: receipt.receipt.cost_usd,
    signature: receipt.signature,
    timestamp: receipt.receipt.issued_at_unix,
    receipt_url: `/api/v1/receipt/${verdictHash}`,
  })
}

/**
 * The autonomous loop step — Sina calls this WITHOUT a new founder prompt.
 * Returns the next action Sina should take, derived from the verification result.
 */
export function nextActionFromResult(result: VerifyResult): {
  action: 'deploy' | 'fix' | 'abort'
  reason: string
  deployToken?: string
} {
  if (result.verdict === 'pass') {
    return {
      action: 'deploy',
      reason: `Verification passed. Deploy token issued, bound to artifact ${result.artifactHash?.slice(0, 24)}.`,
      deployToken: result.deployToken ?? undefined,
    }
  }
  const failed = result.gates?.filter((g) => !g.passed) ?? []
  const critical = failed.filter((g) => g.name.startsWith('G1') || g.name.startsWith('G2'))
  if (critical.length > 0) {
    return {
      action: 'abort',
      reason: `Critical gate failure: ${critical.map((g) => g.name).join(', ')}. Requires human review.`,
    }
  }
  return {
    action: 'fix',
    reason: `Non-critical failures: ${failed.map((g) => g.name).join(', ')}. Retry with DeepSeek.`,
  }
}
```

## Sina's Supabase memory schema (additive)

Add this table to your existing Supabase (alongside `runway_runtime_jobs_v1`):

```sql
CREATE TABLE sina_verification_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_hash TEXT UNIQUE NOT NULL,
  artifact_hash TEXT NOT NULL,
  gates JSONB NOT NULL,
  cost_usd DECIMAL NOT NULL,
  signature TEXT NOT NULL,
  receipt_url TEXT NOT NULL,
  model_identity TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

After each verification, Sina inserts a row. After restart, Sina reads the last N rows to reconstruct context — no new founder prompt needed.

## Phase 4 acceptance

- [ ] 2 real jobs executed
- [ ] 2 independent verification receipts (different `verdict_hash` values)
- [ ] 0 additional founder prompts (Sina selects next action from `nextActionFromResult`)
- [ ] Sina continues after restart (reads `sina_verification_memory` to reconstruct context)

## What NOT to build in Phase 4

- Do NOT add new gates to the engine (G0-G7 is the contract).
- Do NOT modify the API endpoints (the SDK already wraps them).
- Do NOT build a separate verifier service — use the public receipt endpoint.
