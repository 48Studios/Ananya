'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardCheck, Plus, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface StockCount {
  id: string
  countNumber: string
  warehouseName: string
  type: 'CYCLE_COUNT' | 'ANNUAL_AUDIT' | 'SPOT_CHECK'
  totalItems: number
  discrepanciesCount: number
  status: 'DRAFT' | 'IN_PROGRESS' | 'RECONCILED'
  countDate: string
}

const mockCounts: StockCount[] = [
  {
    id: 'sc-1',
    countNumber: 'CNT-2026-001',
    warehouseName: 'Main Assembly Warehouse',
    type: 'CYCLE_COUNT',
    totalItems: 140,
    discrepanciesCount: 2,
    status: 'RECONCILED',
    countDate: '2026-01-30',
  },
  {
    id: 'sc-2',
    countNumber: 'CNT-2026-002',
    warehouseName: 'Raw Electronics Stockroom',
    type: 'SPOT_CHECK',
    totalItems: 45,
    discrepanciesCount: 0,
    status: 'IN_PROGRESS',
    countDate: '2026-02-04',
  },
]

export default function StockCountsPage() {
  const [counts] = React.useState<StockCount[]>(mockCounts)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Status',
      options: [
        { label: 'Draft', value: 'DRAFT' },
        { label: 'In Progress', value: 'IN_PROGRESS' },
        { label: 'Reconciled', value: 'RECONCILED' },
      ],
    },
  ]

  const columns: ColumnDef<StockCount>[] = [
    {
      accessorKey: 'countNumber',
      header: 'Audit ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.countNumber}
        </span>
      ),
    },
    {
      accessorKey: 'warehouseName',
      header: 'Warehouse Location',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.warehouseName}</span>,
    },
    {
      accessorKey: 'type',
      header: 'Audit Type',
      cell: ({ row }) => (
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: 'totalItems',
      header: 'SKUs Audited',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.totalItems} items</span>,
    },
    {
      accessorKey: 'discrepanciesCount',
      header: 'Variance',
      cell: ({ row }) => {
        const count = row.original.discrepanciesCount
        if (count === 0) {
          return (
            <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 0 Variance
            </span>
          )
        }
        return (
          <span className="inline-flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {count} Discrepancy
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'RECONCILED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Reconciled
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> In Progress
          </span>
        )
      },
    },
    {
      accessorKey: 'countDate',
      header: 'Audit Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.countDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Audits & Cycle Counting"
        description="Schedule physical stock counts, log inventory variances, and execute balance reconciliations."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Stock Audit Run
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Audit Runs"
          value={counts.length}
          icon={<ClipboardCheck className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Active Stock Audits"
          value={counts.filter((c) => c.status === 'IN_PROGRESS').length}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Reconciled Audits"
          value={counts.filter((c) => c.status === 'RECONCILED').length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={counts}
        columns={columns}
        searchPlaceholder="Search stock audits by ID, warehouse, or type..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
