'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { QrCode, Plus, CheckCircle2, Clock, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'

interface SerialRecord {
  id: string
  serialNumber: string
  sku: string
  componentName: string
  status: 'IN_STOCK' | 'ASSIGNED' | 'DISPATCHED' | 'MAINTENANCE'
  location: string
}

const mockSerials: SerialRecord[] = [
  {
    id: 'ser-1',
    serialNumber: 'SN-772910-A',
    sku: 'COMP-1001',
    componentName: 'Precision CNC Spindle Motor 5kW',
    status: 'IN_STOCK',
    location: 'Main Assembly WH / Bin A1-04',
  },
  {
    id: 'ser-2',
    serialNumber: 'SN-881023-B',
    sku: 'COMP-1004',
    componentName: 'Optical Encoder Sensor Array',
    status: 'ASSIGNED',
    location: 'Work Center 2 - Subassembly',
  },
]

export default function SerialsPage() {
  const [serials] = React.useState<SerialRecord[]>(mockSerials)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Serial Lifecycle',
      options: [
        { label: 'In Stock', value: 'IN_STOCK' },
        { label: 'Assigned', value: 'ASSIGNED' },
        { label: 'Dispatched', value: 'DISPATCHED' },
        { label: 'Maintenance', value: 'MAINTENANCE' },
      ],
    },
  ]

  const columns: ColumnDef<SerialRecord>[] = [
    {
      accessorKey: 'serialNumber',
      header: 'Serial Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.serialNumber}
        </span>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'Item / Product SKU',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">{row.original.sku}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.componentName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'location',
      header: 'Current Storage Path',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.location}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'IN_STOCK') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> In Stock
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serial Number Master Index"
        description="Individual serial number tracking, barcode assignment, asset history, and component lifecycle."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Register Serial Number
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Serials Registered"
          value={serials.length}
          icon={<QrCode className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Available In Stock"
          value={serials.filter((s) => s.status === 'IN_STOCK').length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Assigned to Orders"
          value={serials.filter((s) => s.status === 'ASSIGNED').length}
          icon={<Tag className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={serials}
        columns={columns}
        searchPlaceholder="Search serials by number, SKU, product, or location..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
