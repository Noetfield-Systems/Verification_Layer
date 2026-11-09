'use client'

/**
 * Verifications — the full filterable table view.
 *
 * Filter bar: project select + verdict select + search input (filters by
 * artifact_hash or verdict_hash locally).
 * Table: Verdict / Project / Source / Artifact Type / Artifact Hash (copyable)
 *        / Cost / Created At (absolute ISO).
 * Click row → opens Verification Detail view.
 */

import * as React from 'react'
import { Search, ShieldCheck, Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { VerdictBadge } from './verdict-badge'
import { CopyableHash } from './copyable-hash'
import { EmptyState } from './empty-state'
import { DataTableShell } from './data-table-shell'
import { SectionHeader } from './section-header'
import { useVerifications, useProjects } from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { formatUsd } from '@/lib/format'

type VerdictFilter = 'all' | 'pass' | 'fail'

export function VerificationsView() {
  const storeProjectId = useDashboardStore((s) => s.selectedProjectId)
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId)
  const openVerification = useDashboardStore((s) => s.openVerification)
  const projectsQ = useProjects()

  const [verdict, setVerdict] = React.useState<VerdictFilter>('all')
  const [search, setSearch] = React.useState('')

  // The list query: pass through the verdict filter and the store's project filter.
  const listQ = useVerifications({
    projectId: storeProjectId,
    verdict: verdict === 'all' ? null : verdict,
    limit: 200,
  })

  // Local search filter applied on top of the server response.
  const rows = React.useMemo(() => {
    const list = listQ.data?.verifications ?? []
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(
      (v) =>
        v.artifact_hash?.toLowerCase().includes(q) ||
        v.verdict_hash?.toLowerCase().includes(q),
    )
  }, [listQ.data, search])

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Verifications"
        description="Every artifact run through the engine. Filter by project or verdict."
        actions={
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setSelectedProjectId(null)
              setVerdict('all')
              setSearch('')
            }}
          >
            Clear filters
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={storeProjectId ?? '__all'}
          onValueChange={(v) => setSelectedProjectId(v === '__all' ? null : v)}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All projects</SelectItem>
            {(projectsQ.data?.projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={verdict} onValueChange={(v) => setVerdict(v as VerdictFilter)}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Verdict" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search artifact / verdict hash…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      {listQ.isLoading ? (
        <Card>
          <CardContent className="space-y-2 py-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Inbox}
              title="No verifications yet"
              description="Run one in the Verify Playground to see it appear here with a full receipt, deploy token, and gate breakdown."
            />
          </CardContent>
        </Card>
      ) : (
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Verdict</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Artifact Hash</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="pr-6 text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow
                  key={v.id}
                  onClick={() => openVerification(v.id)}
                  className="cursor-pointer"
                >
                  <TableCell className="pl-6">
                    <VerdictBadge verdict={v.verdict} />
                  </TableCell>
                  <TableCell className="text-sm">{v.project?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {v.source ?? 'custom'}
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {v.artifact_type}
                  </TableCell>
                  <TableCell>
                    <CopyableHash value={v.artifact_hash} truncate={24} />
                  </TableCell>
                  <TableCell className="text-right text-xs noetfield-mono">
                    {v.cost_usd != null ? formatUsd(v.cost_usd, 6) : '—'}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-xs noetfield-mono text-muted-foreground">
                    {v.created_at}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-emerald-500" />
          {rows.length} result{rows.length === 1 ? '' : 's'}
        </span>
        <span>refetches every 30s</span>
      </div>
    </div>
  )
}
