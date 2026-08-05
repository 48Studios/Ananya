'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'

interface MaterialShortage {
  id: string
  sku: string
  componentName: string
  requiredByDate: string
  leadTimeDays: number
  suggestedPoQuantity: number
}

const mockShortages: MaterialShortage[] = [
  {
    id: 'mat-1',
    sku: 'COMP-1001',
    componentName: 'Microcontroller Unit ARM Cortex-M4',
    requiredByDate: '2026-02-20',
    leadTimeDays: 14,
    suggestedPoQuantity: 100,
  },
]

export default function MrpMaterialsPage() {
  const [shortages] = React.useState<MaterialShortage[]>(mockShortages)

  const columns: ColumnDef<MaterialShortage>[] = [
    {
      accessorKey: 'sku',
      header: 'Shortage Component SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.sku}
        </span>
      ),
    },
    {
      accessorKey: 'componentName',
      header: 'Description',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.componentName}</span>,
    },
    {
      accessorKey: 'requiredByDate',
      header: 'Required By Date',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.requiredByDate}</span>,
    },
    {
      accessorKey: 'leadTimeDays',
      header: 'Supplier Lead Time',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.leadTimeDays} days</span>,
    },
    {
      accessorKey: 'suggestedPoQuantity',
      header: 'Suggested Reorder Qty',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
          {row.original.suggestedPoQuantity} units
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="MRP Material Shortage Matrix"
        description="Review time-phased component shortages, lead time horizons, and auto-generated purchase requisitions."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Component Shortages"
          value={shortages.length}
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Critical Lead Horizon"
          value="< 14 Days"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Reorder Actionable"
          value="1 Pending PO"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={shortages}
        columns={columns}
        searchPlaceholder="Search material shortages..."
      />
    </div>
  )
}
