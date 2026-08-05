'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Undo2, Plus, CheckCircle2, Clock, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatCurrency, formatDate } from '@/lib/utils'

interface SupplierReturn {
  id: string
  returnNumber: string
  supplierName: string
  poNumber: string
  totalAmount: number
  status: 'DRAFT' | 'DISPATCHED' | 'CREDITED'
  returnDate: string
}

const mockReturns: SupplierReturn[] = [
  {
    id: 'sret-1',
    returnNumber: 'SR-2026-001',
    supplierName: 'Global Microelectronics Co.',
    poNumber: 'PO-2026-042',
    totalAmount: 14200,
    status: 'CREDITED',
    returnDate: '2026-01-28',
  },
  {
    id: 'sret-2',
    returnNumber: 'SR-2026-002',
    supplierName: 'Precision Steel Alloys',
    poNumber: 'PO-2026-059',
    totalAmount: 8950,
    status: 'DISPATCHED',
    returnDate: '2026-02-02',
  },
]

export default function SupplierReturnsPage() {
  const [returns] = React.useState<SupplierReturn[]>(mockReturns)

  const totalValue = returns.reduce((acc, r) => acc + r.totalAmount, 0)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Status',
      options: [
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Dispatched', value: 'DISPATCHED' },
        { label: 'Credited', value: 'CREDITED' },
      ],
    },
  ]

  const columns: ColumnDef<SupplierReturn>[] = [
    {
      accessorKey: 'returnNumber',
      header: 'Return No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.returnNumber}
        </span>
      ),
    },
    {
      accessorKey: 'supplierName',
      header: 'Supplier',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.supplierName}</span>,
    },
    {
      accessorKey: 'poNumber',
      header: 'Ref PO',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.poNumber}</span>,
    },
    {
      accessorKey: 'totalAmount',
      header: 'Return Value',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'CREDITED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Debit Credited
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
          </span>
        )
      },
    },
    {
      accessorKey: 'returnDate',
      header: 'Return Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.returnDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Returns & Debit Notes"
        description="Process vendor returns for rejected material, damaged shipments, and debit note reconciliations."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Supplier Return
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Returns"
          value={returns.length}
          icon={<Undo2 className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Total Return Value"
          value={formatCurrency(totalValue)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Pending Vendor Credit"
          value={returns.filter((r) => r.status !== 'CREDITED').length}
          icon={<Clock className="w-4 h-4 text-amber-500" />}
        />
      </div>

      <EntityDataTable
        data={returns}
        columns={columns}
        searchPlaceholder="Search vendor returns by number, supplier, or PO..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
