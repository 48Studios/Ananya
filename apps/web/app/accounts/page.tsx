'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Landmark, Plus, CheckCircle2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface LedgerAccount {
  id: string
  accountNumber: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  currentBalance: number
  currency: string
}

const mockAccounts: LedgerAccount[] = [
  { id: 'acc-1', accountNumber: '1010-CASH', name: 'Main Operating Checking Account', type: 'ASSET', currentBalance: 345000, currency: 'INR' },
  { id: 'acc-2', accountNumber: '1200-AR', name: 'Trade Accounts Receivable', type: 'ASSET', currentBalance: 124500, currency: 'INR' },
  { id: 'acc-3', accountNumber: '2100-AP', name: 'Trade Accounts Payable', type: 'LIABILITY', currentBalance: 68400, currency: 'INR' },
  { id: 'acc-4', accountNumber: '4000-REV', name: 'Product Sales Revenue', type: 'REVENUE', currentBalance: 890000, currency: 'INR' },
]

export default function AccountsPage() {
  const [accounts] = React.useState<LedgerAccount[]>(mockAccounts)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'type',
      label: 'Account Type',
      options: [
        { label: 'Asset', value: 'ASSET' },
        { label: 'Liability', value: 'LIABILITY' },
        { label: 'Equity', value: 'EQUITY' },
        { label: 'Revenue', value: 'REVENUE' },
        { label: 'Expense', value: 'EXPENSE' },
      ],
    },
  ]

  const columns: ColumnDef<LedgerAccount>[] = [
    {
      accessorKey: 'accountNumber',
      header: 'GL Code',
      cell: ({ row }) => (
        <Link href={`/accounts/${row.original.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
          {row.original.accountNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Account Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'type',
      header: 'Account Type',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: 'currentBalance',
      header: 'Current Balance',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.currentBalance)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/accounts/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Ledger
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts & Ledger Master"
        description="Structure financial accounts, track debit/credit balances, and manage general ledger hierarchy."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Ledger Account
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Accounts"
          value={accounts.length}
          icon={<Landmark className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Balance Status"
          value="Trial Balance Balanced"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Currencies"
          value="INR Primary Base"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={accounts}
        columns={columns}
        searchPlaceholder="Search accounts by code or name..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
