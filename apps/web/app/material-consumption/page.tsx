'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Layers, Plus, CheckCircle2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface ConsumptionRecord {
  id: string
  issueNumber: string
  workOrderNumber: string
  componentSku: string
  componentName: string
  quantityIssued: number
  uom: string
  issuedBy: string
  timestamp: string
}

const mockConsumption: ConsumptionRecord[] = [
  {
    id: 'c-1',
    issueNumber: 'ISS-2026-088',
    workOrderNumber: 'WO-2026-001',
    componentSku: 'COMP-1001',
    componentName: 'Microcontroller Unit ARM Cortex-M4',
    quantityIssued: 25,
    uom: 'PCS',
    issuedBy: 'Operator Dev',
    timestamp: '2026-02-04T10:30:00Z',
  },
  {
    id: 'c-2',
    issueNumber: 'ISS-2026-089',
    workOrderNumber: 'WO-2026-002',
    componentSku: 'COMP-1002',
    componentName: 'Precision Resistor 10k Ohm 0.1%',
    quantityIssued: 150,
    uom: 'PCS',
    issuedBy: 'Operator Dev',
    timestamp: '2026-02-05T09:15:00Z',
  },
]

export default function MaterialConsumptionPage() {
  const [records] = React.useState<ConsumptionRecord[]>(mockConsumption)

  const columns: ColumnDef<ConsumptionRecord>[] = [
    {
      accessorKey: 'issueNumber',
      header: 'Issue Slip No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.issueNumber}
        </span>
      ),
    },
    {
      accessorKey: 'workOrderNumber',
      header: 'Work Order',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.workOrderNumber}</span>,
    },
    {
      accessorKey: 'componentSku',
      header: 'Component',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">{row.original.componentSku}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.componentName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'quantityIssued',
      header: 'Qty Issued',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.quantityIssued} {row.original.uom}
        </span>
      ),
    },
    {
      accessorKey: 'issuedBy',
      header: 'Issued By',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.issuedBy}</span>,
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
        title="Material Consumption & Backflushing"
        description="Track raw material issues, work order material consumption, and automated stock backflushing."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Issue Material to Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Issues Logged"
          value={records.length}
          icon={<Layers className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Components Issued"
          value={records.reduce((acc, r) => acc + r.quantityIssued, 0)}
          icon={<Package className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Issue Status"
          value="100% Verified"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={records}
        columns={columns}
        searchPlaceholder="Search material issues by slip #, work order, or SKU..."
      />
    </div>
  )
}
