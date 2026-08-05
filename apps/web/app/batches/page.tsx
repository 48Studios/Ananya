'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Boxes, Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface BatchRecord {
  id: string
  batchNumber: string
  sku: string
  componentName: string
  quantityOnHand: number
  manufactureDate: string
  expiryDate: string
  status: 'ACTIVE' | 'EXPIRED' | 'QUARANTINED'
}

const mockBatches: BatchRecord[] = [
  {
    id: 'bat-1',
    batchNumber: 'BAT-2026-0811',
    sku: 'CHEM-SOLDER-01',
    componentName: 'Lead-Free Solder Paste SAC305',
    quantityOnHand: 45,
    manufactureDate: '2026-01-10',
    expiryDate: '2026-07-10',
    status: 'ACTIVE',
  },
  {
    id: 'bat-2',
    batchNumber: 'BAT-2026-0922',
    sku: 'ADHESIVE-EP-02',
    componentName: 'Thermal Conductive Epoxy Compound',
    quantityOnHand: 12,
    manufactureDate: '2025-08-15',
    expiryDate: '2026-02-15',
    status: 'ACTIVE',
  },
]

export default function BatchesPage() {
  const [batches] = React.useState<BatchRecord[]>(mockBatches)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Batch Status',
      options: [
        { label: 'Active', value: 'ACTIVE' },
        { label: 'Quarantined', value: 'QUARANTINED' },
        { label: 'Expired', value: 'EXPIRED' },
      ],
    },
  ]

  const columns: ColumnDef<BatchRecord>[] = [
    {
      accessorKey: 'batchNumber',
      header: 'Batch / Lot No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.batchNumber}
        </span>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU / Material',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">{row.original.sku}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.componentName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'quantityOnHand',
      header: 'On-Hand Stock',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.quantityOnHand} units</span>,
    },
    {
      accessorKey: 'manufactureDate',
      header: 'Mfg Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.manufactureDate)}</span>,
    },
    {
      accessorKey: 'expiryDate',
      header: 'Expiry Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.expiryDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'ACTIVE') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Active
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="w-3 h-3 mr-1" /> {s}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch & Lot Management"
        description="Track material batches, lot expiry dates, quarantine holds, and batch genealogy."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Lot Batch
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Registered Batches"
          value={batches.length}
          icon={<Boxes className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Active Lot Stock"
          value={batches.filter((b) => b.status === 'ACTIVE').length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Expiring Soon (<30 Days)"
          value="1 Batch"
          icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
        />
      </div>

      <EntityDataTable
        data={batches}
        columns={columns}
        searchPlaceholder="Search batches by number, SKU, or material..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
