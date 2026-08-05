'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Wrench, Plus, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface MaintenanceSchedule {
  id: string
  workCenterCode: string
  equipmentName: string
  taskType: 'CALIBRATION' | 'PREVENTIVE' | 'OVERHAUL'
  lastCompletedDate: string
  nextDueDate: string
  status: 'SCHEDULED' | 'OVERDUE' | 'COMPLETED'
}

const mockMaintenance: MaintenanceSchedule[] = [
  { id: 'm-1', workCenterCode: 'WC-01-SMT', equipmentName: 'Pick & Place Head Nozzle Array', taskType: 'CALIBRATION', lastCompletedDate: '2026-01-15', nextDueDate: '2026-02-15', status: 'SCHEDULED' },
  { id: 'm-2', workCenterCode: 'WC-02-CNC', equipmentName: '5-Axis Spindle Fluid Coolant Pump', taskType: 'PREVENTIVE', lastCompletedDate: '2026-01-05', nextDueDate: '2026-02-05', status: 'SCHEDULED' },
]

export default function MaintenancePage() {
  const [schedules] = React.useState<MaintenanceSchedule[]>(mockMaintenance)

  const columns: ColumnDef<MaintenanceSchedule>[] = [
    {
      accessorKey: 'equipmentName',
      header: 'Equipment Asset',
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-xs text-primary">{row.original.equipmentName}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{row.original.workCenterCode}</p>
        </div>
      ),
    },
    {
      accessorKey: 'taskType',
      header: 'Maintenance Task',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.taskType}
        </span>
      ),
    },
    {
      accessorKey: 'lastCompletedDate',
      header: 'Last Service',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.lastCompletedDate)}</span>,
    },
    {
      accessorKey: 'nextDueDate',
      header: 'Next Service Due',
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-foreground">{formatDate(row.original.nextDueDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> Scheduled
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment Preventive Maintenance"
        description="Schedule machine calibration, preventive maintenance runs, and equipment inspection logs."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Schedule Maintenance Work
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Equipment Assets Tracked"
          value={schedules.length}
          icon={<Wrench className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Scheduled This Month"
          value="2 Tasks"
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Uptime Performance"
          value="99.8% Available"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={schedules}
        columns={columns}
        searchPlaceholder="Search maintenance tasks..."
      />
    </div>
  )
}
