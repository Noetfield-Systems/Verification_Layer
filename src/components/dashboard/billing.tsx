'use client'

/**
 * Billing — cost tracking dashboard.
 *
 * - 3 stat cards: Total cost (sum), This month, Avg cost per verification.
 * - Bar chart: cost per day for last 7 days (from stats.seven_day_trend[].cost).
 * - Per-project cost breakdown table (computed client-side by fetching the
 *   last 200 verifications and grouping by project).
 * - A note card explaining the engine-layer measurement model.
 */

import * as React from 'react'
import { DollarSign, CalendarDays, TrendingUp, Receipt, Info } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { SectionHeader } from './section-header'
import { DataTableShell } from './data-table-shell'
import { useStats, useVerifications } from '@/lib/dashboard-api'
import { formatUsd } from '@/lib/format'

export function BillingView() {
  const statsQ = useStats()
  const verifQ = useVerifications({ limit: 200 })

  const trend = statsQ.data?.seven_day_trend ?? []

  // Compute per-project cost breakdown client-side.
  const perProject = React.useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {}
    for (const v of verifQ.data?.verifications ?? []) {
      const pid = v.project?.id ?? 'unknown'
      if (!map[pid]) {
        map[pid] = { name: v.project?.name ?? 'Unknown', count: 0, total: 0 }
      }
      map[pid].count += 1
      map[pid].total += v.cost_usd ?? 0
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [verifQ.data])

  const totalCost = statsQ.data?.total_cost_usd ?? 0
  const totalVerif = statsQ.data?.total ?? 0
  const avgCost = totalVerif > 0 ? totalCost / totalVerif : 0

  // Compute "this month" cost from the verifications list (last 200).
  const thisMonthCost = React.useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return (verifQ.data?.verifications ?? [])
      .filter((v) => new Date(v.created_at) >= monthStart)
      .reduce((sum, v) => sum + (v.cost_usd ?? 0), 0)
  }, [verifQ.data])

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Billing"
        description="Estimated internal compute cost based on configured per-verification rates, not invoices or actual billing."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statsQ.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Total Cost"
              value={formatUsd(totalCost, 6)}
              icon={DollarSign}
              accent="emerald"
              sublabel={`${totalVerif} verifications`}
            />
            <StatCard
              label="This Month"
              value={formatUsd(thisMonthCost, 6)}
              icon={CalendarDays}
              sublabel="accumulated this calendar month"
            />
            <StatCard
              label="Avg / Verification"
              value={formatUsd(avgCost, 6)}
              icon={TrendingUp}
              sublabel="across all time"
            />
          </>
        )}
      </div>

      {/* Cost chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost — last 7 days</CardTitle>
          <CardDescription>USD per day, summed at verification time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            {statsQ.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
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
                    tickFormatter={(v: number) => `$${v.toFixed(4)}`}
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
                    formatter={(value: number) => [formatUsd(value, 6), 'cost']}
                    labelStyle={{ color: '#a3a3a3', fontSize: 11 }}
                  />
                  <Bar dataKey="cost" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-project breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-project breakdown</CardTitle>
          <CardDescription>
            Computed from the last 200 verifications. Sortable in Phase 5.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {verifQ.isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : perProject.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              No verifications to bill yet.
            </div>
          ) : (
            <DataTableShell className="rounded-none border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Project</TableHead>
                    <TableHead className="text-right">Verifications</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="pr-6 text-right">Avg Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perProject.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="pl-6 text-sm font-medium">{p.name}</TableCell>
                      <TableCell className="text-right text-xs">{p.count}</TableCell>
                      <TableCell className="text-right noetfield-mono text-xs">
                        {formatUsd(p.total, 6)}
                      </TableCell>
                      <TableCell className="pr-6 text-right noetfield-mono text-xs">
                        {formatUsd(p.count > 0 ? p.total / p.count : 0, 6)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 py-5">
          <Info className="mt-0.5 size-4 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Billing is measured at the engine layer. Every verification records
            actual compute + storage cost. Invoicing integrates with Stripe in Phase 5.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
