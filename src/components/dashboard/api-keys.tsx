'use client'

/**
 * ApiKeys — manage Noetfield API keys.
 *
 * - Header with a "Create Key" button → opens a Dialog (name + project select).
 * - Table: Name / Key prefix (mono) / Project / Scopes / Created / Last Used /
 *   Status (Active/Revoked) / Actions (Revoke w/ confirm dialog).
 * - When a key is created, a "Show once" Dialog appears with the full plaintext
 *   and a copy button + warning.
 * - Empty state for first-time users.
 */

import * as React from 'react'
import { KeyRound, Plus, AlertTriangle, Loader2, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyableHash } from './copyable-hash'
import { EmptyState } from './empty-state'
import { DataTableShell } from './data-table-shell'
import { SectionHeader } from './section-header'
import { useApiKeys, useCreateKey, useRevokeKey, useProjects } from '@/lib/dashboard-api'
import { RelativeTime } from './relative-time'
import { toast } from '@/hooks/use-toast'
import type { ApiKeyCreated } from '@/lib/dashboard-types'

export function ApiKeysView() {
  const keysQ = useApiKeys()
  const projectsQ = useProjects()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [newKey, setNewKey] = React.useState<ApiKeyCreated | null>(null)
  const [revokeTarget, setRevokeTarget] = React.useState<{ id: string; name: string } | null>(null)

  const createMut = useCreateKey()
  const revokeMut = useRevokeKey()

  const onCreate = async (name: string, projectId?: string) => {
    try {
      const created = await createMut.mutateAsync({ name, projectId })
      setNewKey(created)
      setCreateOpen(false)
      toast({ title: 'Key created', description: `${created.name} is now active.` })
      // Delight moment — subtle confetti on key creation.
      import('./confetti').then((m) => m.fireKeyCreatedConfetti()).catch(() => {})
    } catch (e) {
      toast({
        title: 'Create failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const onRevoke = async () => {
    if (!revokeTarget) return
    try {
      await revokeMut.mutateAsync(revokeTarget.id)
      toast({ title: 'Key revoked', description: revokeTarget.name })
    } catch (e) {
      toast({
        title: 'Revoke failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setRevokeTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="API Keys"
        description="Keys used by your agents and CI to call /api/v1/verify."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create Key
          </Button>
        }
      />

      {keysQ.isLoading ? (
        <Card>
          <CardContent className="space-y-2 py-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (keysQ.data?.keys ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={KeyRound}
              title="No API keys"
              description="Create your first key to start verifying artifacts."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> Create Key
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keysQ.data?.keys ?? []).map((k) => {
                const revoked = !!k.revoked_at
                return (
                  <TableRow key={k.id}>
                    <TableCell className="pl-6 text-sm font-medium">{k.name}</TableCell>
                    <TableCell>
                      <span className="noetfield-mono text-xs text-muted-foreground">
                        {k.prefix}…
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{k.project?.name ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.split(',').map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] font-normal">
                            {s.trim()}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RelativeTime iso={k.created_at} className="text-xs text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      {k.last_used_at ? (
                        <RelativeTime iso={k.last_used_at} className="text-xs text-muted-foreground" />
                      ) : (
                        <span className="text-xs text-muted-foreground">never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {revoked ? (
                        <Badge variant="outline" className="nf-fail-bg nf-fail border-transparent">
                          REVOKED
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="nf-pass-bg nf-pass border-transparent">
                          ACTIVE
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {!revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-400"
                          onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </DataTableShell>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projectsQ.data?.projects ?? []}
        onCreate={onCreate}
        creating={createMut.isPending}
      />

      <PlaintextKeyDialog
        created={newKey}
        onClose={() => setNewKey(null)}
      />

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.name} will stop working immediately. Any agent or CI job using it
              will receive 401 errors. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRevoke}
              className="bg-red-500 text-white hover:bg-red-500/90"
            >
              {revokeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CreateKeyDialog({
  open,
  onOpenChange,
  projects,
  onCreate,
  creating,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projects: { id: string; name: string }[]
  onCreate: (name: string, projectId?: string) => void
  creating: boolean
}) {
  const [name, setName] = React.useState('')
  const [projectId, setProjectId] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (open) {
      setName('')
      setProjectId(projects[0]?.id)
    }
  }, [open, projects])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The plaintext key will be shown once. Store it securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production CI"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="key-project">Project</Label>
            <Select value={projectId ?? '__none'} onValueChange={(v) => setProjectId(v === '__none' ? undefined : v)}>
              <SelectTrigger id="key-project" className="mt-1.5 w-full">
                <SelectValue placeholder="Pick a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.length === 0 && <SelectItem value="__none">No projects</SelectItem>}
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onCreate(name.trim() || 'Untitled Key', projectId)}
            disabled={creating || projects.length === 0}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlaintextKeyDialog({
  created,
  onClose,
}: {
  created: ApiKeyCreated | null
  onClose: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  const open = !!created

  const onCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.plaintext)
      setCopied(true)
      toast({ title: 'Copied', description: 'API key copied to clipboard' })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-emerald-500" /> Your new API key
          </DialogTitle>
          <DialogDescription>
            Copy it now. For security, Noetfield never stores the plaintext.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
          <div className="flex items-start gap-2 text-xs nf-pass">
            <AlertTriangle className="mt-0.5 size-4" />
            <span>This key will not be shown again. Store it securely.</span>
          </div>
        </div>

        {created && (
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {created.name} · {created.project.name}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="noetfield-mono text-xs break-all">{created.plaintext}</code>
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? <Check className="size-4 nf-pass" /> : <Copy className="size-4" />}
                Copy
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onClose()}>I&apos;ve stored it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
