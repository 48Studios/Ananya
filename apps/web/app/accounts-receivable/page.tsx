'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DollarSign, Plus, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency, formatDate } from '@/lib/utils'

interface AccountsReceivableEntry {
  id: string
  customerName: string
  invoiceNumber: string
  amountDue: number
  agingCategory: 'CURRENT' | '1_30_DAYS' | '31_60_DAYS'
  dueDate: string
}

const mockAr: AccountsReceivableEntry[] = [
  { id: 'ar-1', customerName: 'AeroTech Systems', invoiceNumber: 'INV-CUST-101', amountDue: 48500, agingCategory: 'CURRENT', dueDate: '2026-02-25' },
  { id: 'ar-2', customerName: 'Starlight Robotics', invoiceNumber: 'INV-CUST-102', amountDue: 19800, agingCategory: 'CURRENT', dueDate: '2026-03-01' },
]

export default function AccountsReceivablePage() {
  const [entries] = React.useState<AccountsReceivableEntry[]>(mockAr)

  const totalAr = entries.reduce((acc, e) => acc + e.amountDue, 0)

  const columns: ColumnDef<AccountsReceivableEntry>[] = [
    {
      accessorKey: 'customerName',
      header: 'Customer Name',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.customerName}</span>,
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'Customer Invoice No.',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      accessorKey: 'amountDue',
      header: 'Receivable Amount',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.amountDue)}
        </span>
      ),
    },
    {
      accessorKey: 'agingCategory',
      header: 'AR Aging Status',
      cell: () => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          Current (Current Term)
        </span>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: 'Payment Due Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.dueDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable (AR) Aging & Receipts"
        description="Track customer invoices, payment collection aging, credit limits, and incoming cash flows."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Receive Customer Payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Outstanding AR"
          value={formatCurrency(totalAr)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Current Due (<30 Days)"
          value={formatCurrency(totalAr)}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Collection Rate"
          value="99.1% On Time"
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={entries}
        columns={columns}
        searchPlaceholder="Search AR by customer or invoice..."
      />
    </div>
  )
}
