'use client'

/**
 * Overview — the default landing view of the dashboard.
 *
 * Renders:
 *  - 4 stat cards (Total / Pass Rate / Total Cost / Today)
 *  - 7-day stacked BarChart (pass vs fail per day) with emerald/red
 *  - Recent verifications table (last 10) — click a row to open Detail
 *  - "Three pillars" explainer card (Verify / Token / Audit)
 */

import * as React from 'react'
import {
  ShieldCheck,
  KeyRound,
  ScrollText,
  Activity,
  DollarSign,
  TrendingUp,
  CalendarDays,
  Inbox,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatCard } from './stat-card'
import { VerdictBadge } from './verdict-badge'
import { CopyableHash } from './copyable-hash'
import { RelativeTime } from './relative-time'
import { DataTableShell } from './data-table-shell'
import { SectionHeader } from './section-header'
import { useStats, useVerifications } from '@/lib/dashboard-api'
import { useDashboardStore } from '@/lib/dashboard-store'
import { formatUsd } from '@/lib/format'

export function OverviewView() {
  const statsQ = useStats()
  const recentQ = useVerifications({ limit: 10 })
  const openVerification = useDashboardStore((s) => s.openVerification)

  const stats = statsQ.data
  const trend = stats?.seven_day_trend ?? []

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Overview"
        description="Real-time verification activity across all your projects."
      />

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Verifications"
              value={stats?.total ?? 0}
              icon={Inbox}
              sublabel={`${stats?.projects_count ?? 0} projects monitored`}
            />
            <StatCard
              label="Pass Rate"
              value={`${(((stats?.pass_rate ?? 0) * 100)).toFixed(1)}%`}
              icon={TrendingUp}
              accent={(stats?.pass_rate ?? 0) >= 0.8 ? 'emerald' : 'red'}
              sublabel={`${stats?.passed ?? 0} passed · ${stats?.failed ?? 0} failed`}
            />
            <StatCard
              label="Total Cost USD"
              value={formatUsd(stats?.total_cost_usd ?? 0, 6)}
              icon={DollarSign}
              sublabel="measured at the engine layer"
            />
            <StatCard
              label="Verifications Today"
              value={stats?.today_count ?? 0}
              icon={CalendarDays}
              accent="emerald"
              sublabel="last 24 hours"
            />
          </>
        )}
      </div>

      {/* Chart + Recent table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Verification volume — last 7 days</CardTitle>
            <CardDescription>
              Stacked pass vs fail counts per day. Emerald = pass, red = fail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {statsQ.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#737373"
                      tick={{ fill: '#737373', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#262626' }}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      stroke="#737373"
                      tick={{ fill: '#737373', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#262626' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{
                        backgroundColor: '#141414',
                        border: '1px solid #262626',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#fafafa',
                      }}
                      labelStyle={{ color: '#a3a3a3', fontSize: 11 }}
                    />
                    <Bar dataKey="pass" stackId="v" fill="#10B981" name="pass" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="fail" stackId="v" fill="#EF4444" name="fail" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Three pillars</CardTitle>
            <CardDescription>How Noetfield slots into your deploy pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Pillar
              icon={ShieldCheck}
              title="Verify"
              body="Every artifact runs G0–G7 gates. Deterministic verdict in <50ms."
            />
            <Pillar
              icon={KeyRound}
              title="Token"
              body="PASS issues a 15-minute HMAC deploy token bound to the artifact hash."
            />
            <Pillar
              icon={ScrollText}
              title="Audit"
              body="Tamper-proof receipts for SOC 2 / FINTRAC / EU AI Act submissions."
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent verifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent verifications</CardTitle>
          <CardDescription>Last 10 results. Click a row to inspect the receipt.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {recentQ.isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (recentQ.data?.verifications ?? []).length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              No verifications yet. Run one in the Verify Playground.
            </div>
          ) : (
            <DataTableShell className="rounded-none border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Verdict</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Artifact Hash</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="pr-6 text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentQ.data?.verifications ?? []).map((v) => (
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
                      <TableCell>
                        <CopyableHash value={v.artifact_hash} truncate={20} />
                      </TableCell>
                      <TableCell className="text-right text-xs noetfield-mono">
                        {v.cost_usd != null ? formatUsd(v.cost_usd, 6) : '—'}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <RelativeTime iso={v.created_at} className="text-xs text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md border border-border bg-secondary/40 p-2">
        <Icon className="size-4 text-emerald-500" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  )
}
