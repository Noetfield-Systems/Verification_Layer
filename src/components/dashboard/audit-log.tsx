'use client'

/**
 * AuditLog — the immutable audit trail view.
 *
 * - Project filter select at top.
 * - Export CSV / Export JSON buttons (fetches GET /api/audit?limit=1000).
 * - Table: Timestamp / Actor / Action (badge-styled) / Details (JSON <pre>).
 *
 * Action badge colors:
 *   verify.create   → emerald
 *   key.create      → blue-muted (we use the default outline variant)
 *   key.revoke      → red
 *   project.create  → default (secondary)
 *   project.seed    → muted
 */

import * as React from 'react'
import { Download, FileJson, ScrollText, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SectionHeader } from './section-header'
import { EmptyState } from './empty-state'
import { DataTableShell } from './data-table-shell'
import { useAudit, useProjects, fetchAuditExport } from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { toast } from '@/hooks/use-toast'

export function AuditLogView() {
  const storeProjectId = useDashboardStore((s) => s.selectedProjectId)
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId)
  const projectsQ = useProjects()
  const auditQ = useAudit(storeProjectId, 200)

  const onExport = async (format: 'csv' | 'json') => {
    try {
      const data = await fetchAuditExport(storeProjectId, 1000)
      const blob =
        format === 'json'
          ? new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          : new Blob([auditToCsv(data.audit ?? [])], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `noetfield-audit-${new Date().toISOString().slice(0, 19)}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: `Exported ${format.toUpperCase()}`, description: `${data.audit?.length ?? 0} entries` })
    } catch (e) {
      toast({
        title: 'Export failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Audit Log"
        description="Immutable record of every verification, key, and project event."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('csv')}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('json')}>
              <FileJson className="size-4" /> Export JSON
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
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
      </div>

      {auditQ.isLoading ? (
        <Card>
          <CardContent className="space-y-2 py-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (auditQ.data?.audit ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Inbox}
              title="No audit entries"
              description="Run a verification or create a key to see entries appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="pr-6">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(auditQ.data?.audit ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-6 noetfield-mono text-xs text-muted-foreground">
                    {row.timestamp}
                  </TableCell>
                  <TableCell className="text-xs">{row.actor}</TableCell>
                  <TableCell>
                    <ActionBadge action={row.action} />
                  </TableCell>
                  <TableCell className="pr-6">
                    {row.details ? (
                      <pre className="noetfield-scroll noetfield-mono max-h-24 overflow-auto rounded-md border border-border bg-secondary/40 p-2 text-[11px] leading-relaxed">
                        {JSON.stringify(row.details, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableShell>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScrollText className="size-3.5" />
        {auditQ.data?.audit?.length ?? 0} entries · export fetches up to 1000
      </div>
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const cls = (() => {
    if (action === 'verify.create') return 'nf-pass-bg nf-pass border-transparent'
    if (action === 'key.revoke') return 'nf-fail-bg nf-fail border-transparent'
    if (action === 'key.create') return 'border-border text-foreground'
    if (action === 'project.create') return 'border-border text-foreground'
    if (action === 'project.seed') return 'border-transparent bg-secondary text-secondary-foreground'
    return 'border-border text-muted-foreground'
  })()
  return (
    <Badge variant="outline" className={cn('text-[10px] font-mono uppercase', cls)}>
      {action}
    </Badge>
  )
}

function auditToCsv(rows: Array<{ id: string; actor: string; action: string; details: unknown; timestamp: string }>): string {
  const header = ['id', 'timestamp', 'actor', 'action', 'details']
  const lines = [header.join(',')]
  for (const r of rows) {
    const details = r.details ? JSON.stringify(r.details).replace(/"/g, '""') : ''
    const cells = [r.id, r.timestamp, r.actor, r.action, `"${details}"`]
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}
