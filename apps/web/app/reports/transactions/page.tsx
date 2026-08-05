'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { ChartCard } from '@/components/charts/chart-card'
import { BarChartWidget } from '@/components/charts/bar-chart-widget'
import { DonutChartWidget } from '@/components/charts/donut-chart-widget'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { ReportFilters, FilterState } from '@/components/reports/report-filters'
import { reportingApi, TransactionSummaryDto } from '@/lib/api/reporting-api'
import { inventoryTransactionsApi, InventoryTransactionDto } from '@/lib/api/inventory-transactions-api'
import { formatNumber, formatDate } from '@/lib/utils'

export default function TransactionReportsPage() {
  const [summary, setSummary] = React.useState<TransactionSummaryDto | null>(null)
  const [txList, setTxList] = React.useState<InventoryTransactionDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [filters, setFilters] = React.useState<FilterState>({
    status: '',
    search: '',
  })

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sumData, txData] = await Promise.all([
        reportingApi.getTransactionSummary(),
        inventoryTransactionsApi.getAll(),
      ])
      setSummary(sumData)
      setTxList(txData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load transaction audit report')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredTransactions = React.useMemo(() => {
    return txList.filter((tx) => {
      if (filters.status && tx.transactionType !== filters.status) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matchRef = tx.reference?.toLowerCase().includes(query)
        const matchComp = tx.componentId.toLowerCase().includes(query)
        if (!matchRef && !matchComp) return false
      }
      return true
    })
  }, [txList, filters])

  const columns = React.useMemo<ColumnDef<InventoryTransactionDto>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Transaction ID',
        cell: ({ row }) => (
          <Link
            href={`/transactions/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted font-bold inline-flex items-center gap-1 uppercase"
          >
            {row.original.id.slice(0, 8)}...
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: 'transactionType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
            {row.original.transactionType}
          </span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'Quantity',
        cell: ({ row }) => {
          const isNegative = row.original.quantity < 0
          return (
            <span
              className={`font-mono text-xs font-bold ${
                isNegative ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isNegative ? '' : '+'}{row.original.quantity} {row.original.unitOfMeasure}
            </span>
          )
        },
      },
      {
        accessorKey: 'reference',
        header: 'Reference / Document',
        cell: ({ row }) => (
          <span className="text-xs text-foreground font-mono">
            {row.original.reference || 'N/A'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Recorded Date',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <Link href={`/transactions/${row.original.id}`}>
            <Button variant="ghost" size="xs">
              View Log
            </Button>
          </Link>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return <LoadingState message="Aggregating Transaction audit reports..." />
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Transaction Report Error"
        message={error || 'Unable to load transaction audit analytics.'}
        onRetry={loadData}
      />
    )
  }

  const txTypeDonutData = [
    { name: 'Receipts', value: summary.receiptCount ?? 0, color: '#10b981' },
    { name: 'Issues', value: summary.issueCount ?? 0, color: '#0ea5e9' },
    { name: 'Transfers', value: summary.transferCount ?? 0, color: '#6366f1' },
    { name: 'Adjustments', value: summary.adjustmentCount ?? 0, color: '#f59e0b' },
  ]

  const txVolumeData = [
    { name: 'Receipts', value: summary.receiptCount ?? 0 },
    { name: 'Issues', value: summary.issueCount ?? 0 },
    { name: 'Transfers', value: summary.transferCount ?? 0 },
    { name: 'Adjustments', value: summary.adjustmentCount ?? 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Transaction & Audit Reports"
        description="Immutable stock movement history, transaction type breakdown, and audit ledger logs."
        actions={
          <Link href="/reports">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Reports
            </Button>
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Audit Transactions"
          value={formatNumber(summary.totalTransactions)}
          subtitle="Immutable ledger records"
          icon={ShieldCheck}
        />
        <StatCard
          title="Inbound Receipts"
          value={formatNumber(summary.receiptCount)}
          subtitle="GRN and stock receipts"
          icon={ArrowDownLeft}
        />
        <StatCard
          title="Outbound Issues"
          value={formatNumber(summary.issueCount)}
          subtitle="Production and material issues"
          icon={ArrowUpRight}
        />
        <StatCard
          title="Transfers & Adjustments"
          value={formatNumber((summary.transferCount ?? 0) + (summary.adjustmentCount ?? 0))}
          subtitle={`${formatNumber(summary.transferCount)} transfers, ${formatNumber(summary.adjustmentCount)} adjustments`}
          icon={ArrowRightLeft}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Transaction Volume by Action Type"
            subtitle="Frequency of stock receipts, issues, transfers, and adjustments"
          >
            <BarChartWidget data={txVolumeData} color="#6366f1" height={220} />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Transaction Type Ratio"
            subtitle="Distribution of stock movement types"
          >
            <DonutChartWidget data={txTypeDonutData} height={220} />
          </ChartCard>
        </div>
      </div>

      {/* Filter Bar */}
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showStatusFilter
        statusOptions={[
          { label: 'Receipt', value: 'Receipt' },
          { label: 'Issue', value: 'Issue' },
          { label: 'Transfer', value: 'Transfer' },
          { label: 'Adjustment', value: 'Adjustment' },
          { label: 'Return', value: 'Return' },
          { label: 'Consumption', value: 'Consumption' },
        ]}
      />

      {/* Audit Log Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Transaction Audit Ledger ({filteredTransactions.length} records)
        </h3>
        <EntityDataTable
          columns={columns}
          data={filteredTransactions}
          searchKey="reference"
          searchPlaceholder="Search reference doc or component..."
          loading={loading}
          emptyTitle="No transactions found"
          emptyMessage="No transaction records match the selected report filters."
        />
      </div>
    </div>
  )
}
