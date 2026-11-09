/**
 * Sina Autonomous Loop — Domino 2, with REAL integrations.
 *
 * The loop contract is identical to the proof-of-concept, but now every
 * part that was hardcoded or simulated is replaced with a real integration
 * that activates when the corresponding env var is set:
 *
 *   1. Candidates: read from NextActionCandidate table (was: hardcoded array)
 *      - In production, Sina's evidence pipeline populates this table
 *      - In sandbox, seed it via POST /api/sina/submit-candidate or /api/seed
 *
 *   2. DeepSeek fix: real API call when DEEPSEEK_API_KEY is set
 *      - Falls back to deterministic simulation when no key
 *
 *   3. GitHub commit: real commit when GITHUB_TOKEN + GITHUB_REPO are set
 *      - Falls back to simulated commit when no token
 *
 * The loop marks each candidate's status in the DB (pending → processing →
 * passed | failed | aborted) so state survives restart and is auditable.
 */

import { PrismaClient } from '@prisma/client'

// Fresh PrismaClient — the dev server's global singleton may be stale after
// schema changes. This ensures the loop always sees the latest models.
const db = new PrismaClient({ log: ['error'] })

import { runVerification } from '@/lib/engine/verify'
import { noetfieldSecret, costPerVerify, storedPolicyHash } from '@/lib/noetfield'
import { attest } from '@/lib/independent-verifier'
import { fixArtifactWithDeepSeek, hasDeepSeekKey } from '@/lib/deepseek'
import { commitVerifiedCode, hasGitHubConfig } from '@/lib/github'
import type { VerifyResult } from '@/lib/engine/verify'

const MAX_FIX_ATTEMPTS = 3

export interface DominoStepTrace {
  step: number
  candidateId: string
  candidateLabel: string
  attempt: number
  action: string
  verdict: 'pass' | 'fail' | null
  verdictHash: string | null
  artifactHash: string | null
  failedGates: string[]
  fixedArtifact?: string
  fixSource?: 'deepseek' | 'simulation' | null
  receiptUrl: string | null
  attestationVerified: boolean | null
  githubBranch?: string | null
  githubCommitSha?: string | null
  githubUrl?: string | null
  githubReal?: boolean | null
  nextAction: string
  timestamp: string
}

export interface DominoRunResult {
  dominoRun: number
  startedAt: string
  finishedAt: string
  steps: DominoStepTrace[]
  receiptsIssued: string[]
  attestationsIssued: string[]
  githubCommits: Array<{ candidateId: string; branch: string; sha: string; url: string; real: boolean }>
  nextActionSelected: string | null
  aborted: boolean
  abortReason: string | null
  integrationStatus: {
    deepseek: 'real' | 'simulation'
    github: 'real' | 'simulation'
    candidateSource: 'database'
  }
}

/**
 * Run one domino. Default: dominoRun = 2.
 *
 * Reads pending candidates from NextActionCandidate table, processes each
 * one through verify → (fix → retry on fail) → issue receipt + independent
 * attestation + GitHub commit → mark candidate passed/failed → select next
 * action from the result.
 *
 * NO new founder prompt. The next action is derived from the prior result.
 */
export async function runDomino(opts: {
  dominoRun?: number
  maxCandidates?: number
  projectId: string
}): Promise<DominoRunResult> {
  const dominoRun = opts.dominoRun ?? 2
  const maxCandidates = opts.maxCandidates ?? 10
  const startedAt = new Date().toISOString()
  const expectedPolicyHash = await storedPolicyHash()

  // Resume from prior state.
  const priorRows = await db.sinaMemory.findMany({
    where: { dominoRun },
    orderBy: { step: 'asc' },
  })
  let step = priorRows[priorRows.length - 1]?.step ?? 0

  // Read REAL candidates from the DB (replaces the hardcoded CANDIDATES array).
  const candidates = await db.nextActionCandidate.findMany({
    where: { status: 'pending' },
    orderBy: { step: 'asc' },
    take: maxCandidates,
  })

  const steps: DominoStepTrace[] = []
  const receiptsIssued: string[] = []
  const attestationsIssued: string[] = []
  const githubCommits: DominoRunResult['githubCommits'] = []
  let aborted = false
  let abortReason: string | null = null
  let nextActionSelected: string | null = null

  for (const candidate of candidates) {
    if (aborted) break

    // Mark candidate as processing.
    await db.nextActionCandidate.update({
      where: { id: candidate.id },
      data: { status: 'processing', attemptCount: 0 },
    })

    let artifact = candidate.artifact
    let attempt = 0
    let verdict: 'pass' | 'fail' | null = null
    let result: VerifyResult | null = null
    let failedGates: string[] = []

    // Inner fix-retry loop (max 3 attempts)
    while (attempt < MAX_FIX_ATTEMPTS) {
      attempt++
      step++
      result = runVerification(
        {
          artifact,
          artifactType: candidate.artifactType as 'code' | 'workflow' | 'config',
          source: candidate.source as 'bolt' | 'v0' | 'cursor' | 'custom',
          projectId: opts.projectId,
          modelIdentity: candidate.modelIdentity || undefined,
        },
        {
          expectedPolicyHash,
          secret: noetfieldSecret(),
          costUsdPerVerify: costPerVerify(),
          issuedAtUnix: Math.floor(Date.now() / 1000),
        },
      )
      verdict = result.verdict
      failedGates = result.gates.filter((g) => !g.passed && !g.name.startsWith('G7')).map((g) => g.name)

      // Update candidate attempt count.
      await db.nextActionCandidate.update({
        where: { id: candidate.id },
        data: { attemptCount: attempt },
      })

      // Record the verification step.
      await db.sinaMemory.create({
        data: {
          step,
          dominoRun,
          action: 'verify',
          actionInput: JSON.stringify({ candidateId: candidate.id, attempt }),
          verdictHash: result.verdictHash,
          artifactHash: result.artifactHash,
          result: verdict,
          nextAction: verdict === 'pass' ? 'issue_receipt' : attempt < MAX_FIX_ATTEMPTS ? 'fix_with_deepseek' : 'abort_candidate',
        },
      })
      steps.push({
        step,
        candidateId: candidate.id,
        candidateLabel: candidate.label,
        attempt,
        action: 'verify',
        verdict,
        verdictHash: result.verdictHash,
        artifactHash: result.artifactHash,
        failedGates,
        receiptUrl: result.verdictHash ? `/api/v1/receipt/${result.verdictHash}` : null,
        attestationVerified: null,
        nextAction: verdict === 'pass' ? 'issue_receipt' : attempt < MAX_FIX_ATTEMPTS ? 'fix_with_deepseek' : 'abort_candidate',
        timestamp: new Date().toISOString(),
      })

      if (verdict === 'pass') break

      // FAIL → ask DeepSeek to fix (real API call if key set, else simulation)
      if (attempt < MAX_FIX_ATTEMPTS) {
        const fixResult = await fixArtifactWithDeepSeek(artifact, failedGates, candidate.label)
        await db.sinaMemory.create({
          data: {
            step: ++step,
            dominoRun,
            action: 'fix_with_deepseek',
            actionInput: JSON.stringify({
              candidateId: candidate.id,
              attempt,
              source: fixResult.usedRealDeepSeek ? 'deepseek' : 'simulation',
            }),
            result: 'pending',
            nextAction: 'verify',
          },
        })
        steps.push({
          step,
          candidateId: candidate.id,
          candidateLabel: candidate.label,
          attempt,
          action: 'fix_with_deepseek',
          verdict: null,
          verdictHash: null,
          artifactHash: null,
          failedGates: [],
          fixedArtifact: fixResult.fixedArtifact.slice(0, 100) + '…',
          fixSource: fixResult.usedRealDeepSeek ? 'deepseek' : 'simulation',
          receiptUrl: null,
          attestationVerified: null,
          nextAction: 'verify',
          timestamp: new Date().toISOString(),
        })
        artifact = fixResult.fixedArtifact
      }
    }

    if (verdict !== 'pass') {
      aborted = true
      abortReason = `candidate ${candidate.id} (${candidate.label}) failed after ${attempt} attempts (gates: ${failedGates.join(', ')})`
      await db.nextActionCandidate.update({
        where: { id: candidate.id },
        data: { status: 'aborted', processedAt: new Date() },
      })
      await db.sinaMemory.create({
        data: {
          step: ++step,
          dominoRun,
          action: 'abort_candidate',
          actionInput: JSON.stringify({ candidateId: candidate.id }),
          result: 'aborted',
          nextAction: 'stop_domino',
        },
      })
      break
    }

    // PASS → persist verification + receipt
    const verification = await persistVerification({
      result: result!,
      candidate,
      projectId: opts.projectId,
      attempt,
    })

    // Issue independent attestation
    const attestation = await attest({
      verdictHash: result!.verdictHash!,
      artifact,
      artifactType: candidate.artifactType as 'code' | 'workflow' | 'config',
      source: candidate.source as 'bolt' | 'v0' | 'cursor' | 'custom',
      projectId: opts.projectId,
    })
    receiptsIssued.push(result!.verdictHash!)
    if (attestation.verified) attestationsIssued.push(result!.verdictHash!)

    // REAL GitHub commit on PASS
    const githubResult = await commitVerifiedCode({
      artifact,
      verdictHash: result!.verdictHash!,
      candidateLabel: candidate.label,
      candidateId: candidate.id,
      attempt,
      artifactType: candidate.artifactType as 'code' | 'workflow' | 'config',
    })
    githubCommits.push({
      candidateId: candidate.id,
      branch: githubResult.branch,
      sha: githubResult.commitSha,
      url: githubResult.url,
      real: githubResult.usedRealGitHub,
    })

    // Mark candidate as passed + record GitHub refs.
    await db.nextActionCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'passed',
        verdictHash: result!.verdictHash,
        artifactHash: result!.artifactHash,
        processedAt: new Date(),
        githubBranch: githubResult.branch,
        githubCommitSha: githubResult.commitSha,
        githubUrl: githubResult.url,
      },
    })

    await db.sinaMemory.create({
      data: {
        step: ++step,
        dominoRun,
        action: 'issue_receipt',
        actionInput: JSON.stringify({
          candidateId: candidate.id,
          verdictHash: result!.verdictHash,
          githubBranch: githubResult.branch,
          githubReal: githubResult.usedRealGitHub,
        }),
        verdictHash: result!.verdictHash,
        artifactHash: result!.artifactHash,
        result: attestation.verified ? 'pass' : 'fail',
        nextAction: 'next_action',
      },
    })
    steps.push({
      step,
      candidateId: candidate.id,
      candidateLabel: candidate.label,
      attempt,
      action: 'issue_receipt',
      verdict: 'pass',
      verdictHash: result!.verdictHash,
      artifactHash: result!.artifactHash,
      failedGates: [],
      receiptUrl: `/api/v1/receipt/${result!.verdictHash}`,
      attestationVerified: attestation.verified,
      githubBranch: githubResult.branch,
      githubCommitSha: githubResult.commitSha,
      githubUrl: githubResult.url,
      githubReal: githubResult.usedRealGitHub,
      nextAction: 'next_action',
      timestamp: new Date().toISOString(),
    })
  }

  // If we got here without aborting and processed at least one candidate,
  // the next action is "await next candidate from evidence pipeline".
  if (!aborted && candidates.length > 0) {
    nextActionSelected = `domino_complete: processed ${candidates.length} candidate(s), awaiting next from evidence pipeline (NO new prompt)`
  } else if (candidates.length === 0) {
    nextActionSelected = 'queue_empty: no pending candidates — Sina waits for evidence pipeline to propose NextActionCandidate(s)'
  }

  return {
    dominoRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
    receiptsIssued,
    attestationsIssued,
    githubCommits,
    nextActionSelected,
    aborted,
    abortReason,
    integrationStatus: {
      deepseek: hasDeepSeekKey() ? 'real' : 'simulation',
      github: hasGitHubConfig() ? 'real' : 'simulation',
      candidateSource: 'database',
    },
  }
}

/** Persist the verification + receipt so both are retrievable by hash. */
async function persistVerification(args: {
  result: VerifyResult
  candidate: { id: string; label: string; artifactType: string; source: string; modelIdentity: string | null }
  projectId: string
  attempt: number
}) {
  let apiKey = await db.apiKey.findFirst({
    where: { projectId: args.projectId, revokedAt: null },
  })
  if (!apiKey) {
    const { generateApiKey, hashApiKey } = await import('@/lib/noetfield')
    const plaintext = generateApiKey()
    apiKey = await db.apiKey.create({
      data: {
        keyHash: hashApiKey(plaintext),
        keyPrefix: plaintext.slice(0, 12),
        name: `sina-loop-${args.candidate.id}`,
        ownerId: (await db.user.findFirst({ where: { email: 'demo@noetfield.com' } }))!.id,
        projectId: args.projectId,
      },
    })
  }

  const existing = await db.verification.findUnique({
    where: { verdictHash: args.result.verdictHash },
    include: { receipt: true },
  })
  if (existing) {
    if (!existing.receipt) {
      await db.receipt.create({
        data: {
          verificationId: existing.id,
          receiptJson: args.result.receiptJson,
          artifactRef: existing.artifactRef,
          signature: args.result.receiptSignature,
        },
      })
    }
    return existing
  }

  const artifactRef = `sina-loop:${args.candidate.id}:attempt${args.attempt}`
  const verification = await db.verification.create({
    data: {
      projectId: args.projectId,
      apiKeyId: apiKey.id,
      artifactHash: args.result.artifactHash,
      artifactType: args.candidate.artifactType,
      artifactRef,
      status: 'complete',
      verdict: args.result.verdict,
      verdictHash: args.result.verdictHash,
      gates: JSON.stringify(args.result.gates),
      deployToken: args.result.deployToken?.token ?? null,
      tokenExpiry: args.result.deployToken ? new Date(args.result.deployToken.expiryUnix * 1000) : null,
      costUsd: args.result.costUsd,
      modelIdentity: args.candidate.modelIdentity,
      source: args.candidate.source,
      metadata: JSON.stringify({ sina_loop: true, candidate: args.candidate.id, attempt: args.attempt }),
      completedAt: new Date(),
    },
  })
  await db.receipt.create({
    data: {
      verificationId: verification.id,
      receiptJson: args.result.receiptJson,
      artifactRef,
      signature: args.result.receiptSignature,
    },
  })
  return verification
}

/** Read the current Sina state — used to prove "Sina continues after restart". */
export async function readSinaState(dominoRun?: number) {
  const where = dominoRun ? { dominoRun } : undefined
  const rows = await db.sinaMemory.findMany({
    where,
    orderBy: { step: 'asc' },
    take: 100,
  })
  const last = rows[rows.length - 1] ?? null
  // Also report candidate queue state
  const pendingCount = await db.nextActionCandidate.count({ where: { status: 'pending' } })
  const passedCount = await db.nextActionCandidate.count({ where: { status: 'passed' } })
  const failedCount = await db.nextActionCandidate.count({ where: { status: 'failed' } })
  const abortedCount = await db.nextActionCandidate.count({ where: { status: 'aborted' } })
  return {
    dominoRun: last?.dominoRun ?? null,
    lastStep: last?.step ?? 0,
    lastAction: last?.action ?? null,
    lastResult: last?.result ?? null,
    nextAction: last?.nextAction ?? null,
    totalSteps: rows.length,
    candidateQueue: { pending: pendingCount, passed: passedCount, failed: failedCount, aborted: abortedCount },
    integrationStatus: {
      deepseek: hasDeepSeekKey() ? 'real' : 'simulation',
      github: hasGitHubConfig() ? 'real' : 'simulation',
    },
    rows: rows.map((r) => ({
      step: r.step,
      dominoRun: r.dominoRun,
      action: r.action,
      verdictHash: r.verdictHash,
      artifactHash: r.artifactHash,
      result: r.result,
      nextAction: r.nextAction,
      timestamp: r.timestamp.toISOString(),
    })),
  }
}
