'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Wrench, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'

interface WorkCenterCapacity {
  id: string
  workCenterCode: string
  name: string
  availableHoursWeekly: number
  allocatedHoursWeekly: number
  utilizationPercentage: number
}

const mockCapacity: WorkCenterCapacity[] = [
  { id: 'wc-1', workCenterCode: 'WC-01-SMT', name: 'Surface Mount Pick & Place', availableHoursWeekly: 160, allocatedHoursWeekly: 120, utilizationPercentage: 75.0 },
  { id: 'wc-2', workCenterCode: 'WC-02-CNC', name: '5-Axis CNC Milling Center', availableHoursWeekly: 160, allocatedHoursWeekly: 148, utilizationPercentage: 92.5 },
  { id: 'wc-3', workCenterCode: 'WC-03-ASSY', name: 'Manual Subassembly Line', availableHoursWeekly: 200, allocatedHoursWeekly: 110, utilizationPercentage: 55.0 },
]

export default function MrpCapacityPage() {
  const [centers] = React.useState<WorkCenterCapacity[]>(mockCapacity)

  const columns: ColumnDef<WorkCenterCapacity>[] = [
    {
      accessorKey: 'workCenterCode',
      header: 'Work Center ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.workCenterCode}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Work Center Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'availableHoursWeekly',
      header: 'Capacity (Hrs/Wk)',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.availableHoursWeekly} hrs</span>,
    },
    {
      accessorKey: 'allocatedHoursWeekly',
      header: 'Scheduled Load',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.allocatedHoursWeekly} hrs</span>,
    },
    {
      accessorKey: 'utilizationPercentage',
      header: 'Capacity Utilization',
      cell: ({ row }) => {
        const util = row.original.utilizationPercentage
        if (util > 90) {
          return (
            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {util}% (Near Bottleneck)
            </span>
          )
        }
        return (
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {util}% (Optimal)
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="MRP Work Center Capacity Loading"
        description="Monitor machine shop capacity, labor constraints, and work center utilization loading."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Work Centers"
          value={centers.length}
          icon={<Wrench className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Average Utilization"
          value="74.1%"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Bottlenecks"
          value="1 High Load Center"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
        />
      </div>

      <EntityDataTable
        data={centers}
        columns={columns}
        searchPlaceholder="Search work centers..."
      />
    </div>
  )
}
