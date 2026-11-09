'use client'

/**
 * Projects — project cards grid.
 *
 * - Header with "New Project" button (Dialog: name + slug).
 * - Grid of project cards (responsive 1/2/3 cols).
 * - Each card shows: name, slug, owner email, verification_count,
 *   api_key_count, created date.
 * - Clicking a card filters the Verifications view to that project
 *   and switches view (via the store's filterByProject action).
 */

import * as React from 'react'
import { Plus, FolderKanban, ArrowUpRight, Loader2, Hash, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from './section-header'
import { EmptyState } from './empty-state'
import { RelativeTime } from './relative-time'
import { useCreateProject, useProjects } from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { toast } from '@/hooks/use-toast'

export function ProjectsView() {
  const q = useProjects()
  const filterByProject = useDashboardStore((s) => s.filterByProject)
  const createMut = useCreateProject()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setName('')
      setSlug('')
    }
  }, [open])

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const onCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    try {
      await createMut.mutateAsync({ name: name.trim(), slug: slug.trim() || slugify(name) })
      toast({ title: 'Project created', description: name.trim() })
      setOpen(false)
    } catch (e) {
      toast({
        title: 'Create failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Projects"
        description="Each project groups verifications, API keys, and audit entries."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New Project
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (q.data?.projects ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create one to start organizing verifications."
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="size-4" /> New Project
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data?.projects ?? []).map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-colors hover:border-emerald-500/40"
              onClick={() => filterByProject(p.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground noetfield-mono">
                      {p.slug}
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Owner
                  <div className="mt-0.5 text-foreground">{p.owner.email}</div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <Stat icon={ShieldCheck} value={p.verification_count} label="verif" />
                  <Stat icon={KeyRound} value={p.api_key_count} label="keys" />
                  <Stat icon={Hash} value={p.slug.slice(0, 6)} label="slug" mono />
                </div>

                <div className="mt-4 text-[11px] text-muted-foreground">
                  created <RelativeTime iso={p.created_at} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group verifications and API keys under a project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="p-name">Name</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value))
                }}
                placeholder="e.g. Checkout Service"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="p-slug">Slug</Label>
              <Input
                id="p-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="auto-generated from name"
                className="mt-1.5 noetfield-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Lowercase, kebab-case. Used in audit log exports.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
  mono,
}: {
  icon: typeof ShieldCheck
  value: React.ReactNode
  label: string
  mono?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <div className={`mt-1 text-sm font-medium ${mono ? 'noetfield-mono' : ''}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  )
}
