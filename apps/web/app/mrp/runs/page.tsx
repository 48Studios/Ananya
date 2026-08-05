'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Play, CheckCircle2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface MrpRunRecord {
  id: string
  runNumber: string
  executedBy: string
  itemsProcessed: number
  plannedOrdersCreated: number
  status: 'COMPLETED' | 'IN_PROGRESS'
  timestamp: string
}

const mockRuns: MrpRunRecord[] = [
  {
    id: 'run-1',
    runNumber: 'MRP-RUN-2026-04',
    executedBy: 'Planner Admin',
    itemsProcessed: 1420,
    plannedOrdersCreated: 12,
    status: 'COMPLETED',
    timestamp: '2026-02-05T08:30:00Z',
  },
  {
    id: 'run-2',
    runNumber: 'MRP-RUN-2026-03',
    executedBy: 'System Auto-Scheduler',
    itemsProcessed: 1420,
    plannedOrdersCreated: 8,
    status: 'COMPLETED',
    timestamp: '2026-01-29T00:00:00Z',
  },
]

export default function MrpRunsPage() {
  const [runs] = React.useState<MrpRunRecord[]>(mockRuns)

  const columns: ColumnDef<MrpRunRecord>[] = [
    {
      accessorKey: 'runNumber',
      header: 'MRP Run No.',
      cell: ({ row }) => (
        <Link href={`/mrp/runs/${row.original.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
          {row.original.runNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'executedBy',
      header: 'Triggered By',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.executedBy}</span>,
    },
    {
      accessorKey: 'itemsProcessed',
      header: 'Items Analyzed',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.itemsProcessed} SKUs</span>,
    },
    {
      accessorKey: 'plannedOrdersCreated',
      header: 'Planned Orders Output',
      cell: ({ row }) => <span className="font-mono text-xs font-bold text-foreground">{row.original.plannedOrdersCreated} orders</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
        </span>
      ),
    },
    {
      accessorKey: 'timestamp',
      header: 'Run Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.timestamp)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/mrp/runs/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Execution Log
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="MRP Execution History & Logs"
        description="Review historical material requirements planning calculation runs, log traces, and planned order outputs."
        actions={
          <Button size="sm">
            <Play className="w-4 h-4 mr-1.5" />
            Execute New MRP Run
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total MRP Runs"
          value={runs.length}
          icon={<Play className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Items Processed"
          value="1,420 SKUs"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Success Rate"
          value="100% Clean Execution"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={runs}
        columns={columns}
        searchPlaceholder="Search MRP runs..."
      />
    </div>
  )
}
