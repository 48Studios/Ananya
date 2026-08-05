'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Clock, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { timeEntriesApi, type TimeEntryDto } from '@/lib/api/time-entries-api'
import { formatDate } from '@/lib/utils'

export default function TimePage() {
  const [logs, setLogs] = React.useState<TimeEntryDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    timeEntriesApi.getAll()
      .then((data) => setLogs(data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  const totalHours = React.useMemo(() => {
    return logs.reduce((acc, l) => acc + (l?.hoursLogged || 0), 0)
  }, [logs])

  const columns: ColumnDef<TimeEntryDto>[] = [
    {
      accessorKey: 'employeeName',
      header: 'Employee Name',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.employeeName || 'Staff'}</span>,
    },
    {
      accessorKey: 'workOrderRef',
      header: 'Ref Order / Ticket',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.workOrderRef || '-'}</span>,
    },
    {
      accessorKey: 'taskDescription',
      header: 'Work Completed',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.taskDescription || '-'}</span>,
    },
    {
      accessorKey: 'hoursLogged',
      header: 'Logged Hours',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.hoursLogged || 0} hrs
        </span>
      ),
    },
    {
      accessorKey: 'workDate',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.workDate ? formatDate(row.original.workDate) : '-'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Time Tracking & Labor Logs"
        description="Log labor hours against work orders, field service tickets, and shop floor operations."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Log Hours
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Hours Logged Today"
          value={`${totalHours} hrs`}
          icon={Clock}
        />
        <StatCard
          title="Active Timesheets"
          value={logs.length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Labor Utilization"
          value="100% Direct Labor"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={logs}
        columns={columns}
        searchPlaceholder="Search labor logs by employee or order..."
        loading={loading}
        emptyTitle="No Timesheets Found"
        emptyMessage="No time tracking records currently logged."
        actionButton={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Log Hours
          </Button>
        }
      />
    </div>
  )
}
