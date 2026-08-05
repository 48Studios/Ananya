'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Factory, Plus, CheckCircle2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { workOrdersApi, type WorkOrderDto } from '@/lib/api/work-orders-api'

export default function ProductionOrdersPage() {
  const [orders, setOrders] = React.useState<WorkOrderDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    workOrdersApi.getAll()
      .then((data) => setOrders(data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  const filterConfigs: FilterConfig[] = [
    {
      columnId: 'status',
      title: 'Production Status',
      options: [
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Released', value: 'RELEASED' },
        { label: 'In Progress', value: 'IN_PROGRESS' },
        { label: 'Completed', value: 'COMPLETED' },
      ],
    },
  ]

  const columns: ColumnDef<WorkOrderDto>[] = [
    {
      accessorKey: 'productionNumber',
      header: 'Production Order No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.productionNumber}
        </span>
      ),
    },
    {
      accessorKey: 'quantityPlanned',
      header: 'Target Qty',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.quantityPlanned} units</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'COMPLETED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Play className="w-3 h-3 mr-1" /> {s}
          </span>
        )
      },
    },
    {
      accessorKey: 'endDate',
      header: 'Due Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.endDate || 'Unscheduled'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Orders & Scheduling"
        description="Release production orders to shop floor work centers, allocate components, and track yield output."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Release New Production Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Production Orders"
          value={orders.length}
          icon={Factory}
        />
        <StatCard
          title="In Assembly"
          value={orders.filter((o) => o.status === 'IN_PROGRESS').length}
          icon={Play}
        />
        <StatCard
          title="Completed"
          value={orders.filter((o) => o.status === 'COMPLETED').length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={orders}
        columns={columns}
        searchPlaceholder="Search production orders by number or status..."
        filters={filterConfigs}
        loading={loading}
      />
    </div>
  )
}
