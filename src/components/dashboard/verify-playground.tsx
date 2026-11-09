'use client'

/**
 * VerifyPlayground — the interactive verification demo.
 *
 * Two-pane layout (stacks on mobile):
 *  - Left: Textarea with a default MIT-licensed handler sample, artifact_type
 *    select, source select, a Verify button, and a "Load sample → fail" button
 *    that injects an AWS key into the textarea.
 *  - Right: the result panel — verdict badge, verdict_hash (mono),
 *    artifact_hash (mono), 8 gate results (compact), deploy token (if pass),
 *    cost. Loading state shows "Running G0–G7 gates…". Error state shows a
 *    red error card.
 *
 * Auth flow:
 *  - The store's `apiKey` is the source of truth (set by /api/seed or by the
 *    API Keys view's create flow).
 *  - If the store has no key, we call ensurePlaygroundApiKey() which lists
 *    existing keys and creates a "Playground Key" if needed, persisting the
 *    plaintext to the store.
 *  - We also need a project_id for the verify call's metadata. We use the
 *    first project from useProjects() (seed creates "Acme Platform").
 */

import * as React from 'react'
import { FlaskConical, Play, Loader2, AlertTriangle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VerdictBadge } from './verdict-badge'
import { CopyableHash } from './copyable-hash'
import { GateResult } from './gate-result'
import { SectionHeader } from './section-header'
import {
  callVerify,
  ensurePlaygroundApiKey,
  useFirstProjectId,
} from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { formatUsd } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import type {
  ArtifactType,
  Source,
  VerifyResponse,
  GateResult as GateResultT,
} from '@/lib/dashboard-types'

const DEFAULT_SAMPLE = `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Acme Corp
export default async function handler(req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.id) return new Response('missing id', { status: 400 });
  return Response.json({ ok: true, id: body.id });
}
`

const FAIL_SAMPLE = `// No license header — and a leaked AWS key.
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const AWS_SECRET = "aws_secret_access_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'";
export function s3() { return new AWS.S3({ accessKeyId: AWS_KEY }); }
`

interface PlaygroundState {
  status: 'idle' | 'preparing' | 'verifying' | 'done' | 'error'
  result?: VerifyResponse
  errorMessage?: string
}

export function VerifyPlaygroundView() {
  const [artifact, setArtifact] = React.useState(DEFAULT_SAMPLE)
  const [artifactType, setArtifactType] = React.useState<ArtifactType>('code')
  const [source, setSource] = React.useState<Source>('cursor')
  const [state, setState] = React.useState<PlaygroundState>({ status: 'idle' })

  const storeApiKey = useDashboardStore((s) => s.apiKey)
  const { projectId, isLoading: projectLoading } = useFirstProjectId()

  const onVerify = async () => {
    if (!artifact.trim()) {
      toast({ title: 'Artifact is empty', variant: 'destructive' })
      return
    }
    setState({ status: 'preparing' })
    try {
      // Prefer the store's API key (from signup). Fall back to ensuring one.
      const apiKey = storeApiKey || await ensurePlaygroundApiKey()
      if (!projectId) throw new Error('No authorized project available. Please sign in again.')
      setState({ status: 'verifying' })
      const result = await callVerify({
        apiKey,
        artifact,
        artifactType,
        source,
        projectId,
      })
      setState({ status: 'done', result })
      toast({
        title: `Verdict: ${result.verdict?.toUpperCase() ?? '—'}`,
        description: `${result.gates.length} gates evaluated.`,
      })
      // Delight moment — confetti on PASS, every time.
      if (result.verdict === 'pass') {
        import('./confetti').then((m) => m.firePassConfetti()).catch(() => {})
      }
    } catch (e) {
      setState({ status: 'error', errorMessage: (e as Error).message })
      toast({
        title: 'Verification failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const onLoadFail = () => {
    setArtifact(FAIL_SAMPLE)
    setArtifactType('code')
    setSource('bolt')
    setState({ status: 'idle' })
  }

  const onLoadGood = () => {
    setArtifact(DEFAULT_SAMPLE)
    setArtifactType('code')
    setSource('cursor')
    setState({ status: 'idle' })
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Verify Playground"
        description="Paste any artifact and run the G0–G7 engine against it. No deploys required."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onLoadGood}>
              <Wand2 className="size-4" /> Load sample → pass
            </Button>
            <Button variant="outline" size="sm" onClick={onLoadFail}>
              <AlertTriangle className="size-4" /> Load sample → fail
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artifact</CardTitle>
            <CardDescription>
              The text that will be hashed and run through every gate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="artifact">Source code / config / workflow</Label>
              <Textarea
                id="artifact"
                value={artifact}
                onChange={(e) => setArtifact(e.target.value)}
                className="mt-1.5 noetfield-mono min-h-64 text-xs leading-relaxed"
                spellCheck={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="atype">Artifact type</Label>
                <Select
                  value={artifactType}
                  onValueChange={(v) => setArtifactType(v as ArtifactType)}
                >
                  <SelectTrigger id="atype" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code">code</SelectItem>
                    <SelectItem value="workflow">workflow</SelectItem>
                    <SelectItem value="config">config</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="src">Source</Label>
                <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                  <SelectTrigger id="src" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bolt">bolt</SelectItem>
                    <SelectItem value="v0">v0</SelectItem>
                    <SelectItem value="cursor">cursor</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={onVerify}
              disabled={state.status === 'preparing' || state.status === 'verifying' || projectLoading}
              className="w-full"
            >
              {state.status === 'preparing' || state.status === 'verifying' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {state.status === 'preparing'
                ? 'Preparing API key…'
                : state.status === 'verifying'
                  ? 'Running G0–G7 gates…'
                  : 'Verify'}
            </Button>
            <div className="text-[11px] text-muted-foreground">
              {storeApiKey ? (
                <span>
                  Using API key <span className="noetfield-mono">{storeApiKey.slice(0, 12)}…</span>
                </span>
              ) : (
                <span>No API key in store — a Playground Key will be created on first run.</span>
              )}
              {projectId && (
                <span className="ml-2">
                  · project <span className="noetfield-mono">{projectId.slice(-8)}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: result */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
            <CardDescription>
              The deterministic verdict, gate breakdown, and (if PASS) deploy token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlaygroundResult state={state} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PlaygroundResult({ state }: { state: PlaygroundState }) {
  if (state.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FlaskConical className="size-6 text-muted-foreground" />
        <div className="mt-3 text-sm text-muted-foreground">
          Press <span className="font-medium text-foreground">Verify</span> to run the engine.
        </div>
      </div>
    )
  }
  if (state.status === 'preparing' || state.status === 'verifying') {
    const label = state.status === 'preparing' ? 'Preparing API key…' : 'Running G0–G7 gates…'
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="size-6 animate-spin text-emerald-500" />
        <div className="mt-3 text-sm text-muted-foreground">{label}</div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium nf-fail">
          <AlertTriangle className="size-4" /> Verification error
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{state.errorMessage}</div>
      </div>
    )
  }

  const r = state.result!
  const gates: GateResultT[] = r.gates.map((g, i) => ({
    index: i,
    name: g.name,
    passed: g.passed,
    detail: g.detail,
    evidence: null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <VerdictBadge verdict={r.verdict} size="lg" />
        <div className="text-xs text-muted-foreground">
          cost <span className="noetfield-mono">{formatUsd(r.cost_usd ?? 0, 6)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Field label="verdict_hash">
          <CopyableHash value={r.verdict_hash} truncate={32} className="text-xs" />
        </Field>
        <Field label="artifact_hash">
          <CopyableHash value={r.artifact_hash} truncate={32} className="text-xs" />
        </Field>
        <Field label="job_id">
          <CopyableHash value={r.job_id} truncate={32} className="text-xs" />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Gate results
        </div>
        <div className="rounded-md border border-border bg-secondary/20 px-3">
          {gates.map((g) => (
            <GateResult key={g.index} gate={g} compact />
          ))}
        </div>
      </div>

      {r.verdict === 'pass' && r.deploy_token ? (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Deploy token
          </div>
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
            <CopyableHash value={r.deploy_token} full className="text-xs break-all" />
            {r.token_expiry && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                expires {r.token_expiry}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
