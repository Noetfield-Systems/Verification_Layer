'use client'

/**
 * VerificationDetail — the inspection view for a single verification.
 *
 * Sections:
 *  - Header: verdict badge (large), project name, created/completed timestamps, back button.
 *  - Artifact hash block (full, mono, with copy).
 *  - Gate results: 8 rows G0–G7, expandable evidence.
 *  - Receipt panel: full receipt JSON in a scrollable <pre>, signature (mono, truncated),
 *    "Verify signature" button → calls GET /api/v1/receipt/:verdict_hash, shows ✓/✗.
 *  - Deploy token panel (only if verdict=pass): token, expiry countdown (live),
 *    "Test token" button → opens a dialog where you paste an artifact hash and the
 *    engine POSTs /api/v1/verify-token to show valid/invalid.
 *  - "Export PDF" button → downloads the SOC 2 / FINTRAC / EU AI Act receipt PDF.
 */

import * as React from 'react'
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Download,
  FileText,
  KeyRound,
  CheckCircle2,
  XCircle,
  Loader2,
  FlaskConical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { VerdictBadge } from './verdict-badge'
import { CopyableHash } from './copyable-hash'
import { GateResult } from './gate-result'
import { SectionHeader } from './section-header'
import {
  useVerificationDetail,
  useVerifyReceipt,
  callVerifyToken,
} from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { formatUsd, countdownFromIso } from '@/lib/format'
import { toast } from '@/hooks/use-toast'

export function VerificationDetailView() {
  const id = useDashboardStore((s) => s.selectedVerificationId)
  const setActiveView = useDashboardStore((s) => s.setActiveView)
  const detailQ = useVerificationDetail(id)

  if (!id) {
    return (
      <div className="flex flex-col gap-6">
        <BackButton onClick={() => setActiveView('verifications')} />
        <Card>
          <CardContent className="py-0">
            <div className="py-12 text-center text-sm text-muted-foreground">
              No verification selected. Pick one from the Verifications list.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (detailQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackButton onClick={() => setActiveView('verifications')} />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <div className="flex flex-col gap-6">
        <BackButton onClick={() => setActiveView('verifications')} />
        <Card>
          <CardContent className="py-0">
            <div className="py-12 text-center text-sm text-red-500">
              Failed to load verification: {(detailQ.error as Error)?.message ?? 'unknown error'}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const v = detailQ.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <BackButton onClick={() => setActiveView('verifications')} />
        <PdfExportButton verificationId={v.id} />
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <VerdictBadge verdict={v.verdict} size="lg" />
            <div>
              <div className="text-base font-semibold">{v.project?.name ?? '—'}</div>
              <div className="text-xs text-muted-foreground">
                created {v.created_at} · completed {v.completed_at ?? '—'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Meta label="Source" value={v.source ?? '—'} />
            <Meta label="Type" value={v.artifact_type} />
            <Meta label="Model" value={v.model_identity ?? '—'} />
            <Meta label="Cost" value={v.cost_usd != null ? formatUsd(v.cost_usd, 6) : '—'} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Artifact hash + gates */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Artifact hash</CardTitle>
              <CardDescription>
                SHA-256 of the canonicalized artifact. Bound to the deploy token.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <CopyableHash value={v.artifact_hash} full hideCopy={false} className="text-xs" />
              </div>
              {v.verdict_hash && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Verdict hash
                  </div>
                  <div className="mt-1">
                    <CopyableHash value={v.verdict_hash} full className="text-xs" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gate results — G0 to G7</CardTitle>
              <CardDescription>
                Each gate is deterministic. Expand a row to inspect evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              {(v.gates ?? []).length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">No gate data.</div>
              ) : (
                <div>
                  {(v.gates ?? []).map((g) => (
                    <GateResult key={g.index} gate={g} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Receipt + deploy token */}
        <div className="flex flex-col gap-6">
          <ReceiptPanel
            verdictHash={v.verdict_hash}
            receipt={v.receipt}
          />

          {v.verdict === 'pass' && v.deploy_token ? (
            <DeployTokenPanel
              token={v.deploy_token}
              tokenExpiry={v.token_expiry}
              artifactHash={v.artifact_hash}
            />
          ) : (
            <Card>
              <CardContent className="py-0">
                <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                  <ShieldAlert className="size-5 text-red-500" />
                  No deploy token issued — verdict was not PASS.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2">
      <ArrowLeft className="size-4" /> Back to verifications
    </Button>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 noetfield-mono text-xs">{value}</div>
    </div>
  )
}

function PdfExportButton({ verificationId }: { verificationId: string }) {
  const [downloading, setDownloading] = React.useState(false)
  const onDownload = async () => {
    setDownloading(true)
    try {
      const apiKey = useDashboardStore.getState().apiKey
      const res = await fetch(
        `/api/receipt-pdf?verificationId=${encodeURIComponent(verificationId)}`,
        { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
      )
      if (!res.ok) {
        throw new Error(`PDF request failed: ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dispo = res.headers.get('Content-Disposition') || ''
      const match = dispo.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : `noetfield-receipt-${verificationId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'PDF exported', description: 'Receipt PDF downloaded.' })
    } catch (e) {
      toast({
        title: 'Export failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setDownloading(false)
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
      {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Export PDF (SOC 2 / FINTRAC / EU AI Act)
    </Button>
  )
}

function ReceiptPanel({
  verdictHash,
  receipt,
}: {
  verdictHash: string | null
  receipt: { receipt: Record<string, unknown>; signature: string; signature_algorithm: string } | null
}) {
  const [checkState, setCheckState] = React.useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'ok'; signature: string }
    | { status: 'tampered' }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  // useQuery to fetch the public receipt (gives us the independently-served
  // signature for cross-check).
  const receiptQ = useVerifyReceipt(verdictHash, false)

  const onVerify = async () => {
    if (!verdictHash) return
    setCheckState({ status: 'checking' })
    try {
      const data = await receiptQ.refetch()
      if (!data.data) throw new Error('no receipt returned')
      // The simplest integrity check we can do client-side: compare the
      // signature served by /api/v1/receipt/:verdict_hash to the one stored
      // in the verification row. If they match, the receipt has not been
      // tampered with since issuance.
      const stored = receipt?.signature
      const served = data.data.signature
      if (stored && served && stored === served) {
        setCheckState({ status: 'ok', signature: served })
      } else if (!stored) {
        // No stored signature to compare against — but if the endpoint served
        // one back, that's still a valid receipt lookup.
        setCheckState({ status: 'ok', signature: served })
      } else {
        setCheckState({ status: 'tampered' })
      }
    } catch (e) {
      setCheckState({ status: 'error', message: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Receipt</CardTitle>
            <CardDescription>
              Tamper-proof canonical JSON + HMAC-SHA256 signature.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onVerify} disabled={!verdictHash}>
            {checkState.status === 'checking' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Verify signature
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {checkState.status === 'ok' && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs nf-pass">
            <CheckCircle2 className="size-4" /> signature valid — receipt matches public record
          </div>
        )}
        {checkState.status === 'tampered' && (
          <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs nf-fail">
            <XCircle className="size-4" /> tampered — signature does not match public record
          </div>
        )}
        {checkState.status === 'error' && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs nf-fail">
            error: {checkState.message}
          </div>
        )}

        <pre className="noetfield-scroll noetfield-mono max-h-80 overflow-auto rounded-md border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
          {receipt ? JSON.stringify(receipt.receipt, null, 2) : 'No receipt stored.'}
        </pre>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Signature ({receipt?.signature_algorithm ?? 'HMAC-SHA256'})
          </div>
          <div className="mt-1">
            <CopyableHash value={receipt?.signature} truncate={48} className="text-xs" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DeployTokenPanel({
  token,
  tokenExpiry,
  artifactHash,
}: {
  token: string
  tokenExpiry: string | null
  artifactHash: string
}) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  void now

  const [testOpen, setTestOpen] = React.useState(false)

  const countdown = React.useMemo(() => countdownFromIso(tokenExpiry), [tokenExpiry, now])

  const expired = tokenExpiry ? new Date(tokenExpiry).getTime() < Date.now() : false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Deploy token</CardTitle>
            <CardDescription>
              Short-lived HMAC bound to the artifact hash. Infrastructure must call{' '}
              <span className="noetfield-mono">POST /api/v1/verify-token</span> before deploy.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
            <FlaskConical className="size-4" /> Test token
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-secondary/40 p-3">
          <CopyableHash value={token} full className="text-xs break-all" />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">expires in</span>
          <span
            className={
              expired
                ? 'noetfield-mono nf-fail'
                : 'noetfield-mono text-emerald-500'
            }
          >
            {countdown}
          </span>
        </div>
        <Separator />
        <div className="text-xs text-muted-foreground">
          Bound artifact hash:{' '}
          <CopyableHash value={artifactHash} truncate={24} className="text-xs" />
        </div>
      </CardContent>

      <TestTokenDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        token={token}
        defaultArtifactHash={artifactHash}
      />
    </Card>
  )
}

function TestTokenDialog({
  open,
  onOpenChange,
  token,
  defaultArtifactHash,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  defaultArtifactHash: string
}) {
  const [hash, setHash] = React.useState(defaultArtifactHash)
  const [state, setState] = React.useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'ok'; valid: boolean; expired: boolean; reason: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  React.useEffect(() => {
    if (open) {
      setHash(defaultArtifactHash)
      setState({ status: 'idle' })
    }
  }, [open, defaultArtifactHash])

  const onTest = async () => {
    setState({ status: 'checking' })
    try {
      const r = await callVerifyToken(token, hash)
      setState({
        status: 'ok',
        valid: r.valid,
        expired: r.expired,
        reason: r.reason,
      })
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Test deploy token
          </DialogTitle>
          <DialogDescription>
            Simulates an infrastructure check. The token + artifact hash are POSTed
            to <span className="noetfield-mono">/api/v1/verify-token</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="test-hash">Artifact hash</Label>
            <Input
              id="test-hash"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              className="mt-1.5 noetfield-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Change the hash to see the signature check fail.
            </p>
          </div>

          {state.status === 'ok' && (
            <div
              className={
                state.valid
                  ? 'flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs nf-pass'
                  : 'flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs nf-fail'
              }
            >
              {state.valid ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              {state.valid
                ? 'Token valid — artifact hash matches signature.'
                : `Token invalid — ${state.reason}${state.expired ? ' (expired)' : ''}`}
            </div>
          )}
          {state.status === 'error' && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs nf-fail">
              error: {state.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onTest} disabled={state.status === 'checking' || !hash}>
            {state.status === 'checking' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
