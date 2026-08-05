'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DollarSign, Plus, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency, formatDate } from '@/lib/utils'

interface AccountsPayableEntry {
  id: string
  supplierName: string
  invoiceNumber: string
  currentDue: number
  agingCategory: 'CURRENT' | '1_30_DAYS' | '31_60_DAYS' | 'OVER_60_DAYS'
  dueDate: string
}

const mockAp: AccountsPayableEntry[] = [
  { id: 'ap-1', supplierName: 'Global Microelectronics Co.', invoiceNumber: 'INV-SUP-901', currentDue: 18450, agingCategory: 'CURRENT', dueDate: '2026-02-28' },
  { id: 'ap-2', supplierName: 'Precision Steel Alloys', invoiceNumber: 'INV-SUP-882', currentDue: 8900, agingCategory: '1_30_DAYS', dueDate: '2026-01-20' },
]

export default function AccountsPayablePage() {
  const [entries] = React.useState<AccountsPayableEntry[]>(mockAp)

  const totalAp = entries.reduce((acc, e) => acc + e.currentDue, 0)

  const columns: ColumnDef<AccountsPayableEntry>[] = [
    {
      accessorKey: 'supplierName',
      header: 'Supplier Vendor',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.supplierName}</span>,
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice No.',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      accessorKey: 'currentDue',
      header: 'Amount Payable',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.currentDue)}
        </span>
      ),
    },
    {
      accessorKey: 'agingCategory',
      header: 'AP Aging Bracket',
      cell: ({ row }) => {
        const cat = row.original.agingCategory
        if (cat === 'CURRENT') {
          return (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Current (On Schedule)
            </span>
          )
        }
        return (
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Overdue 1-30 Days
          </span>
        )
      },
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.dueDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Payable (AP) Aging & Bills"
        description="Monitor vendor liabilities, aging brackets, payment schedules, and cash outflow projections."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Process Vendor Payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Accounts Payable"
          value={formatCurrency(totalAp)}
          icon={<DollarSign className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Current Due (<30 Days)"
          value={formatCurrency(18450)}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="Overdue Accounts"
          value="1 Vendor Bill"
          icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
        />
      </div>

      <EntityDataTable
        data={entries}
        columns={columns}
        searchPlaceholder="Search AP by supplier or invoice..."
      />
    </div>
  )
}
