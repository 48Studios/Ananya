'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Landmark, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface BankAccount {
  id: string
  bankName: string
  accountNumberMasked: string
  accountType: 'CHECKING' | 'SAVINGS' | 'MONEY_MARKET'
  currentBalance: number
  reconciledStatus: boolean
}

const mockBankAccounts: BankAccount[] = [
  { id: 'b-1', bankName: 'HDFC Corporate Commercial Bank', accountNumberMasked: '•••• •••• 9812', accountType: 'CHECKING', currentBalance: 345000, reconciledStatus: true },
  { id: 'b-2', bankName: 'State Bank Industrial Reserve', accountNumberMasked: '•••• •••• 4410', accountType: 'SAVINGS', currentBalance: 140000, reconciledStatus: true },
]

export default function BankAccountsPage() {
  const [accounts] = React.useState<BankAccount[]>(mockBankAccounts)

  const totalCash = accounts.reduce((acc, a) => acc + a.currentBalance, 0)

  const columns: ColumnDef<BankAccount>[] = [
    {
      accessorKey: 'bankName',
      header: 'Banking Institution',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.bankName}</span>,
    },
    {
      accessorKey: 'accountNumberMasked',
      header: 'Account Number',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.accountNumberMasked}</span>,
    },
    {
      accessorKey: 'accountType',
      header: 'Account Type',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.accountType}
        </span>
      ),
    },
    {
      accessorKey: 'currentBalance',
      header: 'Cleared Bank Balance',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.currentBalance)}
        </span>
      ),
    },
    {
      accessorKey: 'reconciledStatus',
      header: 'Reconciliation',
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Reconciled
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Accounts & Liquidity Management"
        description="Monitor corporate bank balances, checking/savings liquid reserves, and bank feeds."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Connect Bank Account
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Cash Reserves"
          value={formatCurrency(totalCash)}
          icon={<Landmark className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Active Corporate Accounts"
          value={accounts.length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Reconciliation Status"
          value="100% Up to Date"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={accounts}
        columns={columns}
        searchPlaceholder="Search bank accounts..."
      />
    </div>
  )
}
