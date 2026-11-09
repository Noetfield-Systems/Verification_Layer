/**
 * POST /api/seed
 *
 * One-time bootstrap. Creates a demo user, project, API key, and a handful
 * of sample verifications (mix of pass/fail) so the dashboard has real data
 * to display. Idempotent — safe to call repeatedly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
// Fresh PrismaClient — the dev server's global singleton can be stale after
// schema changes. This ensures the seed route always sees the latest models.
const db = new PrismaClient({ log: ['error'] })
import { ensurePolicyBootstrap, generateApiKey, hashApiKey, noetfieldSecret, storedPolicyHash, costPerVerify } from '@/lib/noetfield'
import { runVerification } from '@/lib/engine/verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAMPLE_ARTIFACTS = [
  {
    label: 'Good: Next.js API handler (MIT, no secrets)',
    artifact: `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Acme Corp
export default async function handler(req, res) {
  const body = await req.json();
  return Response.json({ ok: true, id: body.id });
}
`,
    artifactType: 'code' as const,
    source: 'cursor' as const,
    modelIdentity: 'deepseek-coder-v2',
  },
  {
    label: 'Good: Stripe webhook (Apache-2.0)',
    artifact: `// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Acme Corp
import Stripe from 'stripe';
export async function POST(req) {
  const event = req.body;
  if (event.type === 'checkout.session.completed') {
    return new Response('ok');
  }
  return new Response('ignored');
}
`,
    artifactType: 'code' as const,
    source: 'v0' as const,
    modelIdentity: 'gpt-4o',
  },
  {
    label: 'Good: config (workflow)',
    artifact: `name: deploy-prod
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`,
    artifactType: 'workflow' as const,
    source: 'custom' as const,
    modelIdentity: 'claude-3-7-sonnet',
  },
  {
    label: 'Bad: AWS key leaked',
    artifact: `const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const AWS_SECRET = "aws_secret_access_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'";
export function s3() { return new AWS.S3({ accessKeyId: AWS_KEY }); }
`,
    artifactType: 'code' as const,
    source: 'bolt' as const,
    modelIdentity: 'deepseek-coder-v2',
  },
  {
    label: 'Bad: hardcoded prod DB URL',
    artifact: `const DATABASE_URL = "postgres://admin:s3cret@db.prod.acme.io:5432/main";
export const pool = new Pool({ connectionString: DATABASE_URL });
`,
    artifactType: 'code' as const,
    source: 'cursor' as const,
    modelIdentity: 'gpt-4o',
  },
  {
    label: 'Bad: GitHub PAT leaked',
    artifact: `const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
export async function push(repo) {
  return fetch('https://api.github.com/repos/' + repo + '/pulls', {
    headers: { Authorization: 'token ' + GITHUB_TOKEN }
  });
}
`,
    artifactType: 'code' as const,
    source: 'custom' as const,
    modelIdentity: 'claude-3-7-sonnet',
  },
]

export async function POST(req: NextRequest) {
  const seedToken = process.env.NOETFIELD_DEMO_SEED_TOKEN
  if (!seedToken || req.headers.get('authorization') !== `Bearer ${seedToken}`) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await ensurePolicyBootstrap()
  const expectedPolicyHash = await storedPolicyHash()

  // 1. User
  const user = await db.user.upsert({
    where: { email: 'demo@noetfield.com' },
    update: {},
    create: {
      email: 'demo@noetfield.com',
      name: 'Sina Kazemnezhad',
      role: 'admin',
    },
  })

  // 2. Project
  const project = await db.project.upsert({
    where: { slug: 'acme-platform' },
    update: {},
    create: {
      name: 'Acme Platform',
      slug: 'acme-platform',
      ownerId: user.id,
    },
  })

  // 3. API key (only create if none exists for this user/project)
  let apiKey = await db.apiKey.findFirst({
    where: { ownerId: user.id, projectId: project.id, revokedAt: null },
  })
  let plaintextKey: string | null = null
  if (!apiKey) {
    plaintextKey = generateApiKey()
    apiKey = await db.apiKey.create({
      data: {
        keyHash: hashApiKey(plaintextKey),
        keyPrefix: plaintextKey.slice(0, 12),
        name: 'Demo Key',
        ownerId: user.id,
        projectId: project.id,
        scopes: 'verify:write,verify:read',
      },
    })
  }

  // 4. Sample verifications (only if project has none yet)
  const existingCount = await db.verification.count({ where: { projectId: project.id } })
  if (existingCount === 0) {
    const issuedAtUnix = Math.floor(Date.now() / 1000)
    let i = 0
    for (const sample of SAMPLE_ARTIFACTS) {
      const result = runVerification(
        {
          artifact: sample.artifact,
          artifactType: sample.artifactType,
          source: sample.source,
          projectId: project.id,
          modelIdentity: sample.modelIdentity,
          metadata: { source: sample.source, label: sample.label },
        },
        {
          expectedPolicyHash,
          secret: noetfieldSecret(),
          costUsdPerVerify: costPerVerify(),
          issuedAtUnix: issuedAtUnix - i * 600, // stagger over the last hour
        },
      )
      const artifactRef = `inline:${result.artifactHash.slice(7, 19)}`
      const v = await db.verification.create({
        data: {
          projectId: project.id,
          apiKeyId: apiKey.id,
          artifactHash: result.artifactHash,
          artifactType: sample.artifactType,
          artifactRef,
          status: 'complete',
          verdict: result.verdict,
          verdictHash: result.verdictHash,
          gates: JSON.stringify(result.gates),
          deployToken: result.deployToken?.token ?? null,
          tokenExpiry: result.deployToken ? new Date(result.deployToken.expiryUnix * 1000) : null,
          costUsd: result.costUsd,
          modelIdentity: sample.modelIdentity,
          source: sample.source,
          metadata: JSON.stringify({ source: sample.source, label: sample.label }),
          completedAt: new Date(issuedAtUnix * 1000 - i * 600_000),
          createdAt: new Date(issuedAtUnix * 1000 - i * 600_000),
        },
      })
      await db.receipt.create({
        data: {
          verificationId: v.id,
          receiptJson: result.receiptJson,
          artifactRef,
          signature: result.receiptSignature,
        },
      })
      i++
    }
    await db.auditLog.create({
      data: {
        projectId: project.id,
        actorName: 'system:seed',
        action: 'project.seed',
        details: JSON.stringify({ count: SAMPLE_ARTIFACTS.length }),
      },
    })
  }

  // 5. Seed NextActionCandidate queue (only if empty).
  // This replaces the hardcoded CANDIDATES array. In production, Sina's
  // evidence pipeline populates this table; here we seed the same 3
  // candidates so the loop has real rows to chew on.
  const candidateCount = await db.nextActionCandidate.count()
  if (candidateCount === 0) {
    const candidates = [
      {
        step: 1,
        label: 'Acme API handler (cursor-generated)',
        artifact: `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Acme Corp
export default async function handler(req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.id) return new Response('missing id', { status: 400 });
  return Response.json({ ok: true, id: body.id });
}
`,
        artifactType: 'code',
        source: 'cursor',
        modelIdentity: 'deepseek-coder-v2',
        evidence: { trigger: 'business_evidence: customer needs API handler', source: 'supabase.evidence_table' },
      },
      {
        step: 2,
        label: 'Stripe webhook (v0-generated)',
        artifact: `// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Acme Corp
export async function POST(req) {
  const event = await req.json();
  if (event.type === 'checkout.session.completed') {
    return new Response('ok');
  }
  return new Response('ignored', { status: 200 });
}
`,
        artifactType: 'code',
        source: 'v0',
        modelIdentity: 'gpt-4o',
        evidence: { trigger: 'business_evidence: Stripe integration needed', source: 'supabase.evidence_table' },
      },
      {
        step: 3,
        label: 'Leaky S3 client (bolt-generated, has AWS key)',
        artifact: [
          'const AWS_KEY = "AKIA' + 'IOSFODNN7EXAMPLE";',
          'const AWS_SECRET = "aws_secret_access_key = \'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\'";',
          'export function s3client() {',
          '  return new AWS.S3({ accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET });',
          '}',
          '',
        ].join('\n'),
        artifactType: 'code',
        source: 'bolt',
        modelIdentity: 'deepseek-coder-v2',
        evidence: { trigger: 'business_evidence: S3 upload feature needed', source: 'supabase.evidence_table' },
      },
    ]
    for (const c of candidates) {
      await db.nextActionCandidate.create({
        data: {
          step: c.step,
          label: c.label,
          artifact: c.artifact,
          artifactType: c.artifactType,
          source: c.source,
          modelIdentity: c.modelIdentity,
          evidence: JSON.stringify(c.evidence),
          status: 'pending',
        },
      })
    }
  }

  return NextResponse.json({
    ok: true,
    user: { email: user.email, name: user.name },
    project: { id: project.id, name: project.name, slug: project.slug },
    api_key: plaintextKey
      ? { plaintext: plaintextKey, prefix: apiKey.keyPrefix, name: apiKey.name }
      : { plaintext: '(already exists — call /api/keys to list)', prefix: apiKey.keyPrefix, name: apiKey.name },
    sample_count: SAMPLE_ARTIFACTS.length,
    candidates_queued: candidateCount === 0 ? 3 : 0,
  })
}
