'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { TrendingUp, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface CashFlowProjection {
  id: string
  period: string
  projectedInflow: number
  projectedOutflow: number
  netCashFlow: number
  endingLiquidityReserve: number
}

const mockProjections: CashFlowProjection[] = [
  { id: 'p-1', period: 'February 2026', projectedInflow: 245000, projectedOutflow: 180000, netCashFlow: 65000, endingLiquidityReserve: 550000 },
  { id: 'p-2', period: 'March 2026', projectedInflow: 310000, projectedOutflow: 210000, netCashFlow: 100000, endingLiquidityReserve: 650000 },
  { id: 'p-3', period: 'April 2026', projectedInflow: 280000, projectedOutflow: 195000, netCashFlow: 85000, endingLiquidityReserve: 735000 },
]

export default function ProjectionsPage() {
  const [projections] = React.useState<CashFlowProjection[]>(mockProjections)

  const columns: ColumnDef<CashFlowProjection>[] = [
    {
      accessorKey: 'period',
      header: 'Forecast Month',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.period}</span>,
    },
    {
      accessorKey: 'projectedInflow',
      header: 'Projected Revenue Inflow',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          +{formatCurrency(row.original.projectedInflow)}
        </span>
      ),
    },
    {
      accessorKey: 'projectedOutflow',
      header: 'Projected Expense Outflow',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
          -{formatCurrency(row.original.projectedOutflow)}
        </span>
      ),
    },
    {
      accessorKey: 'netCashFlow',
      header: 'Net Monthly Cash Flow',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          +{formatCurrency(row.original.netCashFlow)}
        </span>
      ),
    },
    {
      accessorKey: 'endingLiquidityReserve',
      header: 'Ending Reserve Balance',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.endingLiquidityReserve)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Projections & Cash Flow Forecast"
        description="Forward-looking cash flow projections, working capital trends, and revenue liquidity models."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Projected Q1 Net Inflow"
          value={formatCurrency(250000)}
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Projected Reserve (April)"
          value={formatCurrency(735000)}
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Model Forecast Confidence"
          value="High Confidence (94%)"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={projections}
        columns={columns}
        searchPlaceholder="Search projection periods..."
      />
    </div>
  )
}
