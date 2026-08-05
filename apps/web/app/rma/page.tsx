'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { RotateCcw, Plus, CheckCircle2, Clock, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface RmaRecord {
  id: string
  rmaNumber: string
  customerName: string
  reason: string
  itemCount: number
  status: 'ISSUED' | 'RECEIVED' | 'INSPECTED' | 'CLOSED'
  issuedDate: string
}

const mockRmas: RmaRecord[] = [
  {
    id: 'rma-1',
    rmaNumber: 'RMA-2026-101',
    customerName: 'AeroTech Systems',
    reason: 'Incorrect SKU delivered - swap required',
    itemCount: 4,
    status: 'RECEIVED',
    issuedDate: '2026-02-01',
  },
  {
    id: 'rma-2',
    rmaNumber: 'RMA-2026-102',
    customerName: 'NexGen Automation',
    reason: 'Defective power controller board',
    itemCount: 2,
    status: 'INSPECTED',
    issuedDate: '2026-02-03',
  },
  {
    id: 'rma-3',
    rmaNumber: 'RMA-2026-103',
    customerName: 'Omni Global Solutions',
    reason: 'Customer cancelled order post-shipment',
    itemCount: 10,
    status: 'ISSUED',
    issuedDate: '2026-02-05',
  },
]

export default function RmaPage() {
  const [rmas] = React.useState<RmaRecord[]>(mockRmas)

  const openRmaCount = rmas.filter((r) => r.status !== 'CLOSED').length

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'RMA Status',
      options: [
        { label: 'Issued', value: 'ISSUED' },
        { label: 'Received', value: 'RECEIVED' },
        { label: 'Inspected', value: 'INSPECTED' },
        { label: 'Closed', value: 'CLOSED' },
      ],
    },
  ]

  const columns: ColumnDef<RmaRecord>[] = [
    {
      accessorKey: 'rmaNumber',
      header: 'RMA Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.rmaNumber}
        </span>
      ),
    },
    {
      accessorKey: 'customerName',
      header: 'Customer',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.customerName}</span>,
    },
    {
      accessorKey: 'reason',
      header: 'Return Reason',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reason}</span>,
    },
    {
      accessorKey: 'itemCount',
      header: 'Items',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.itemCount} units</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'CLOSED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
            </span>
          )
        }
        if (s === 'RECEIVED' || s === 'INSPECTED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Truck className="w-3 h-3 mr-1" /> {s}
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> Issued
          </span>
        )
      },
    },
    {
      accessorKey: 'issuedDate',
      header: 'Issued Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.issuedDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Return Merchandise Authorizations (RMA)"
        description="Manage customer returns, inspection receipts, and merchandise authorization workflows."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Issue New RMA
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total RMAs Issued"
          value={rmas.length}
          icon={<RotateCcw className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Open Processing RMAs"
          value={openRmaCount}
          icon={<Clock className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Received in Warehouse"
          value={rmas.filter((r) => r.status === 'RECEIVED' || r.status === 'INSPECTED').length}
          icon={<Truck className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={rmas}
        columns={columns}
        searchPlaceholder="Search RMAs by number, customer, or return reason..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
