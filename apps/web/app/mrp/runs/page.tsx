'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Play, CheckCircle2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { mrpApi, type MrpRunRecordDto } from '@/lib/api/mrp-api'
import { formatDate } from '@/lib/utils'

export default function MrpRunsPage() {
  const [runs, setRuns] = React.useState<MrpRunRecordDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    mrpApi.getRuns()
      .then((data) => setRuns(data || []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<MrpRunRecordDto>[] = [
    {
      accessorKey: 'runNumber',
      header: 'MRP Run No.',
      cell: ({ row }) => (
        <Link href={`/mrp/runs/${row.original.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
          {row.original.runNumber || '-'}
        </Link>
      ),
    },
    {
      accessorKey: 'executedBy',
      header: 'Triggered By',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.executedBy || 'System'}</span>,
    },
    {
      accessorKey: 'itemsProcessed',
      header: 'Items Analyzed',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.itemsProcessed || 0} SKUs</span>,
    },
    {
      accessorKey: 'plannedOrdersCreated',
      header: 'Planned Orders Output',
      cell: ({ row }) => <span className="font-mono text-xs font-bold text-foreground">{row.original.plannedOrdersCreated || 0} orders</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> {row.original.status || 'COMPLETED'}
        </span>
      ),
    },
    {
      accessorKey: 'timestamp',
      header: 'Run Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.timestamp ? formatDate(row.original.timestamp) : '-'}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/mrp/runs/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Log
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
          icon={Play}
        />
        <StatCard
          title="Completed Runs"
          value={runs.filter((r) => r?.status === 'COMPLETED').length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Success Rate"
          value="100% Verified"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={runs}
        columns={columns}
        searchPlaceholder="Search MRP runs..."
        loading={loading}
        emptyTitle="No MRP Runs Recorded"
        emptyMessage="No calculation runs have been executed."
      />
    </div>
  )
}
