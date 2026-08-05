'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface SystemActivityLog {
  id: string
  action: string
  user: string
  entityType: string
  entityId: string
  timestamp: string
}

const mockActivities: SystemActivityLog[] = [
  { id: 'act-1', action: 'Created Work Order', user: 'Operator Dev', entityType: 'WORK_ORDER', entityId: 'WO-2026-001', timestamp: '2026-02-05T09:12:00Z' },
  { id: 'act-2', action: 'Approved Purchase Order', user: 'Procurement Admin', entityType: 'PURCHASE_ORDER', entityId: 'PO-2026-042', timestamp: '2026-02-04T16:45:00Z' },
]

export default function ActivitiesPage() {
  const [logs] = React.useState<SystemActivityLog[]>(mockActivities)

  const columns: ColumnDef<SystemActivityLog>[] = [
    {
      accessorKey: 'action',
      header: 'Operation Action',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.action}</span>,
    },
    {
      accessorKey: 'user',
      header: 'Executed By',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.user}</span>,
    },
    {
      accessorKey: 'entityType',
      header: 'Target Module',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.entityType}
        </span>
      ),
    },
    {
      accessorKey: 'entityId',
      header: 'Entity Ref ID',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.entityId}</span>,
    },
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.timestamp)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Activity & Operations Log"
        description="Audit user operations, inventory mutations, status changes, and ERP system events."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Logged System Activities"
          value={logs.length}
          icon={<Activity className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Audit Logging"
          value="100% Immutable"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Security State"
          value="Normal Operation"
          icon={<ShieldCheck className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={logs}
        columns={columns}
        searchPlaceholder="Search activity logs by action, user, or entity..."
      />
    </div>
  )
}
