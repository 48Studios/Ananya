'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { mrpApi, type MaterialShortageDto } from '@/lib/api/mrp-api'

export default function MrpMaterialsPage() {
  const [shortages, setShortages] = React.useState<MaterialShortageDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    mrpApi.getShortages()
      .then((data) => setShortages(data || []))
      .catch(() => setShortages([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<MaterialShortageDto>[] = [
    {
      accessorKey: 'sku',
      header: 'Shortage Component SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.sku || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'componentName',
      header: 'Description',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.componentName || '-'}</span>,
    },
    {
      accessorKey: 'requiredByDate',
      header: 'Required By Date',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.requiredByDate || 'Immediate'}</span>,
    },
    {
      accessorKey: 'leadTimeDays',
      header: 'Supplier Lead Time',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.leadTimeDays || 0} days</span>,
    },
    {
      accessorKey: 'suggestedPoQuantity',
      header: 'Suggested Reorder Qty',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
          {row.original.suggestedPoQuantity || 0} units
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
          icon={AlertTriangle}
        />
        <StatCard
          title="Critical Lead Horizon"
          value="Calculated Dynamic"
          icon={CheckCircle2}
        />
        <StatCard
          title="Reorder Actionable"
          value={`${shortages.length} Shortages`}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={shortages}
        columns={columns}
        searchPlaceholder="Search material shortages..."
        loading={loading}
        emptyTitle="No Material Shortages"
        emptyMessage="All material demand is satisfied by available inventory and scheduled PO receipts."
      />
    </div>
  )
}
