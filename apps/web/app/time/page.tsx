'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Clock, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface TimesheetRecord {
  id: string
  employeeName: string
  workOrderRef: string
  taskDescription: string
  hoursLogged: number
  workDate: string
}

const mockTime: TimesheetRecord[] = [
  { id: 't-1', employeeName: 'Operator Dev', workOrderRef: 'WO-2026-001', taskDescription: 'CNC Spindle Assembly & Wire Harness', hoursLogged: 7.5, workDate: '2026-02-04' },
  { id: 't-2', employeeName: 'Field Tech Alex R.', workOrderRef: 'SRV-2026-081', taskDescription: 'On-site Diagnostic Call - AeroTech', hoursLogged: 4.0, workDate: '2026-02-04' },
]

export default function TimePage() {
  const [logs] = React.useState<TimesheetRecord[]>(mockTime)

  const totalHours = logs.reduce((acc, l) => acc + l.hoursLogged, 0)

  const columns: ColumnDef<TimesheetRecord>[] = [
    {
      accessorKey: 'employeeName',
      header: 'Employee Name',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.employeeName}</span>,
    },
    {
      accessorKey: 'workOrderRef',
      header: 'Ref Order / Ticket',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.workOrderRef}</span>,
    },
    {
      accessorKey: 'taskDescription',
      header: 'Work Completed',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.taskDescription}</span>,
    },
    {
      accessorKey: 'hoursLogged',
      header: 'Logged Hours',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.hoursLogged} hrs
        </span>
      ),
    },
    {
      accessorKey: 'workDate',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.workDate)}</span>,
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
          icon={<Clock className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Active Timesheets"
          value={logs.length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Labor Utilization"
          value="96.5% Direct Labor"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={logs}
        columns={columns}
        searchPlaceholder="Search labor logs by employee or order..."
      />
    </div>
  )
}
