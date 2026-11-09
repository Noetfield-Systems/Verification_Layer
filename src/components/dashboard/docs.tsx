'use client'

/**
 * Docs — the API reference page. Styled divs (no MDX).
 *
 * Sections:
 *  - Authentication
 *  - POST /api/v1/verify
 *  - GET /api/v1/verify/:job_id
 *  - GET /api/v1/receipt/:verdict_hash
 *  - POST /api/v1/verify-token
 *  - Gates G0-G7 (table: name | what it checks | FAIL trigger)
 *  - Errors (envelope + status codes)
 */

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CodeBlock } from './code-block'
import { SectionHeader } from './section-header'

const GATE_ROWS: Array<{ name: string; checks: string; failTrigger: string }> = [
  {
    name: 'G0 Provenance',
    checks: 'Source + artifact type are recognized origins.',
    failTrigger: 'source not in [bolt, v0, cursor, custom] or unrecognized type',
  },
  {
    name: 'G1 Policy',
    checks: 'No direct production DB URLs, no hardcoded secrets.',
    failTrigger: 'postgres://user:pass@…, DB_PASSWORD = "…" patterns',
  },
  {
    name: 'G2 Credential',
    checks: 'No leaked cloud provider / third-party API credentials.',
    failTrigger: 'AKIA…, sk_live_…, ghp_…, AIza…, xox[bp]-… patterns',
  },
  {
    name: 'G3 License',
    checks: 'Proper license present (SPDX id or copyright header).',
    failTrigger: 'No SPDX-License-Identifier or Copyright header in code',
  },
  {
    name: 'G4 Transform Fidelity',
    checks: 'Artifact wasn\u2019t mangled in transit.',
    failTrigger: 'U+FFFD, bracket imbalance, size > 5MB, control chars',
  },
  {
    name: 'G5 Policy Immutability',
    checks: 'Running policy hash matches the stored hash for this version.',
    failTrigger: 'POLICY_HASH != EnginePolicy.policyHash',
  },
  {
    name: 'G6 Unordered Commit Lock',
    checks: 'File ordering doesn\u2019t affect the hash (sorted canonicalization).',
    failTrigger: 'always passes (records the canonicalization step)',
  },
  {
    name: 'G7 Deploy Token',
    checks: 'PASS issues a 15-min HMAC token bound to the artifact hash.',
    failTrigger: 'no token issued if any of G0–G6 failed',
  },
]

const AUTH_SNIPPET = `curl https://noetfield.com/api/v1/verify \\
  -H "Authorization: Bearer nf_live_3f9a…" \\
  -H "Content-Type: application/json" \\
  -d '{"artifact": "...", "artifact_type": "code", "metadata": {"source": "cursor", "project_id": "proj_…"}}'`

export function DocsView() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Docs"
        description="API reference for the Noetfield Verification Layer."
      />

      {/* Authentication */}
      <Section title="Authentication">
        <p className="text-sm text-muted-foreground">
          All Phase 1 API requests require an API key in the{' '}
          <span className="noetfield-mono">Authorization</span> header:
        </p>
        <CodeBlock code={AUTH_SNIPPET} language="bash" />
        <p className="text-sm text-muted-foreground">
          Keys are prefixed with <span className="noetfield-mono">nf_live_</span> and can be
          created in the API Keys view. Receipts (<span className="noetfield-mono">GET /api/v1/receipt/:verdict_hash</span>)
          are public — anyone with the verdict hash can fetch and verify the signature.
        </p>
      </Section>

      {/* POST /api/v1/verify */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">POST</Badge>
            <span className="noetfield-mono text-sm">/api/v1/verify</span>
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Submit an artifact for verification. The engine runs synchronously and returns the verdict
          + gate results + deploy token in one response.
        </p>
        <SchemaTable
          rows={[
            ['artifact', 'string | { path: contents }', 'The artifact to verify. String or a bundle.'],
            ['artifact_type', '"code" | "workflow" | "config"', 'Default: code'],
            ['metadata.source', '"bolt" | "v0" | "cursor" | "custom"', 'Origin of the artifact.'],
            ['metadata.project_id', 'string', 'Project to bill + group under.'],
            ['metadata.model_identity', 'string?', 'Optional model identifier (e.g. gpt-4o).'],
          ]}
        />
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Response (201)</div>
        <SchemaTable
          rows={[
            ['job_id', 'string', 'Verification row id.'],
            ['status', '"complete"', 'Engine is synchronous.'],
            ['verdict', '"pass" | "fail"', 'PASS iff G0–G6 all passed.'],
            ['verdict_hash', 'string', 'sha256 of (artifact_hash, gates, policy_hash, version).'],
            ['artifact_hash', 'string', 'sha256 of the canonicalized artifact.'],
            ['gates', 'GateResult[]', '8 entries G0–G7 with name/passed/detail.'],
            ['deploy_token', 'string | null', 'HMAC token bound to artifact_hash (PASS only).'],
            ['token_expiry', 'string | null', 'ISO timestamp, 15 minutes from issue.'],
            ['cost_usd', 'number', 'Real cost measured at the engine layer.'],
            ['receipt_url', 'string', 'GET /api/v1/receipt/:verdict_hash'],
          ]}
        />
      </Section>

      {/* GET /api/v1/verify/:job_id */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="border-border text-foreground">GET</Badge>
            <span className="noetfield-mono text-sm">/api/v1/verify/:job_id</span>
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Poll a verification job by id. Same shape as the POST response (minus the
          <span className="noetfield-mono"> job_id</span>).
        </p>
      </Section>

      {/* GET /api/v1/receipt/:verdict_hash */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="border-border text-foreground">GET</Badge>
            <span className="noetfield-mono text-sm">/api/v1/receipt/:verdict_hash</span>
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Fetch the tamper-proof receipt. <strong>Public endpoint</strong> — no auth required.
          Auditors use this to verify a receipt signature against the canonical JSON body.
        </p>
        <SchemaTable
          rows={[
            ['receipt', 'object', 'The canonical receipt (schema: noetfield.receipt/v1).'],
            ['signature', 'string', 'HMAC-SHA256 over the canonical JSON.'],
            ['signature_algorithm', '"HMAC-SHA256"', 'Fixed.'],
            ['verification_url', 'string', 'POST /api/v1/verify-token'],
            ['project', '{ id, name }', 'The owning project.'],
            ['retrieved_at', 'string', 'ISO timestamp of this fetch.'],
          ]}
        />
      </Section>

      {/* POST /api/v1/verify-token */}
      <Section
        title={
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">POST</Badge>
            <span className="noetfield-mono text-sm">/api/v1/verify-token</span>
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Infrastructure (Cloudflare / Railway / AWS) calls this before deploying an artifact.
          The token must be correctly signed, bound to the artifact hash being deployed, and
          unexpired (15-minute TTL).
        </p>
        <SchemaTable
          rows={[
            ['deploy_token', 'string', 'The token issued on PASS.'],
            ['artifact_hash', 'string', 'The hash of the artifact about to be deployed.'],
          ]}
        />
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Response</div>
        <SchemaTable
          rows={[
            ['valid', 'boolean', 'true iff signature_valid && !expired.'],
            ['expired', 'boolean', 'true iff now > expiry.'],
            ['signature_valid', 'boolean', 'HMAC matches artifact_hash.'],
            ['expiry', 'string | null', 'ISO timestamp of token expiry.'],
            ['verdict_hash', 'string | null', 'Looked up from the artifact_hash.'],
            ['reason', 'string', '"ok" | "token expired" | "signature does not match" | …'],
          ]}
        />
      </Section>

      {/* Gates G0-G7 */}
      <Section title="Gates G0–G7">
        <p className="text-sm text-muted-foreground">
          Every gate is a pure function. No clock, no random, no network. The verdict hash is
          deterministic across runtimes.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Gate</TableHead>
                <TableHead>What it checks</TableHead>
                <TableHead className="pr-4">FAIL trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GATE_ROWS.map((g) => (
                <TableRow key={g.name}>
                  <TableCell className="pl-4 noetfield-mono text-xs font-medium">{g.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.checks}</TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{g.failTrigger}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* Errors */}
      <Section title="Errors">
        <p className="text-sm text-muted-foreground">
          All errors use a standard envelope:
        </p>
        <CodeBlock code={`{ "error": { "code": "unauthorized", "message": "…" } }`} language="json" />
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Status</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="pr-4">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <ErrRow status={400} code="bad_request" when="Malformed JSON or missing required field." />
              <ErrRow status={401} code="unauthorized" when="Missing, invalid, or revoked API key." />
              <ErrRow status={403} code="forbidden" when="API key not bound to the project." />
              <ErrRow status={404} code="not_found" when="Verification, receipt, or project not found." />
              <ErrRow status={500} code="internal" when="Engine or database error." />
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function SchemaTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Field</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="pr-4">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([name, type, desc]) => (
            <TableRow key={name}>
              <TableCell className="pl-4 noetfield-mono text-xs">{name}</TableCell>
              <TableCell className="noetfield-mono text-xs text-muted-foreground">{type}</TableCell>
              <TableCell className="pr-4 text-sm text-muted-foreground">{desc}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ErrRow({ status, code, when }: { status: number; code: string; when: string }) {
  return (
    <TableRow>
      <TableCell className="pl-4 noetfield-mono text-xs">{status}</TableCell>
      <TableCell className="noetfield-mono text-xs text-muted-foreground">{code}</TableCell>
      <TableCell className="pr-4 text-sm text-muted-foreground">{when}</TableCell>
    </TableRow>
  )
}
