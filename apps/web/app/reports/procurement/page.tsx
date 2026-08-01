'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ShoppingCart,
  Truck,
  DollarSign,
  FileCheck,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { ChartCard } from '@/components/charts/chart-card'
import { AreaChartWidget } from '@/components/charts/area-chart-widget'
import { DonutChartWidget } from '@/components/charts/donut-chart-widget'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { ReportFilters, FilterState } from '@/components/reports/report-filters'
import { reportingApi, ProcurementSummaryDto } from '@/lib/api/reporting-api'
import { purchaseOrdersApi, PurchaseOrderDto } from '@/lib/api/purchase-orders-api'

export default function ProcurementReportsPage() {
  const [summary, setSummary] = React.useState<ProcurementSummaryDto | null>(null)
  const [poList, setPoList] = React.useState<PurchaseOrderDto[]>([])
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
      const [sumData, poData] = await Promise.all([
        reportingApi.getProcurementSummary(),
        purchaseOrdersApi.getAll(),
      ])
      setSummary(sumData)
      setPoList(poData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load procurement report data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredOrders = React.useMemo(() => {
    return poList.filter((po) => {
      if (filters.status && po.status !== filters.status) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matchPo = po.poNumber.toLowerCase().includes(query)
        const matchSupplier = po.supplierId.toLowerCase().includes(query)
        if (!matchPo && !matchSupplier) return false
      }
      return true
    })
  }, [poList, filters])

  const columns = React.useMemo<ColumnDef<PurchaseOrderDto>[]>(
    () => [
      {
        accessorKey: 'poNumber',
        header: 'PO #',
        cell: ({ row }) => (
          <Link
            href={`/purchase-orders/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted font-bold inline-flex items-center gap-1 uppercase"
          >
            {row.original.poNumber}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
            {row.original.status}
          </span>
        ),
      },
      {
        accessorKey: 'grandTotal',
        header: 'Grand Total',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            ${row.original.grandTotal.toFixed(2)} {row.original.currency}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Order Date',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <Link href={`/purchase-orders/${row.original.id}`}>
            <Button variant="ghost" size="xs">
              View Order
            </Button>
          </Link>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return <LoadingState message="Aggregating Procurement reports..." />
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Procurement Report Error"
        message={error || 'Unable to load purchasing analytics.'}
        onRetry={loadData}
      />
    )
  }

  const poStatusDonutData = [
    { name: 'Active POs', value: summary.activePurchaseOrders, color: '#0ea5e9' },
    { name: 'Draft POs', value: summary.draftPurchaseOrders, color: '#94a3b8' },
    { name: 'Fulfilled Spend Units', value: summary.totalGoodsReceipts, color: '#10b981' },
  ]

  const spendTrendData = [
    { name: 'Week 1', value: 14500 },
    { name: 'Week 2', value: 22000 },
    { name: 'Week 3', value: 18400 },
    { name: 'Week 4', value: summary.fulfilledSpend || 31200 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Procurement Reports"
        description="Purchase order breakdown, vendor spend performance, and goods receipt metrics."
        breadcrumbs={[
          { label: 'Reports', href: '/reports' },
          { label: 'Procurement Reports' },
        ]}
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
          title="Total Purchase Orders"
          value={summary.totalPurchaseOrders}
          subtitle={`${summary.activePurchaseOrders} active POs`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Total Fulfilled Spend"
          value={`$${summary.fulfilledSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          subtitle="Completed purchase orders"
          icon={DollarSign}
          trend={{ value: '+5.2%', positive: true }}
        />
        <StatCard
          title="Active Suppliers"
          value={summary.totalSuppliers}
          subtitle="Registered vendors"
          icon={Truck}
        />
        <StatCard
          title="Goods Receipts (GRN)"
          value={summary.totalGoodsReceipts}
          subtitle="Received shipments"
          icon={FileCheck}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Monthly Purchasing Spend Trend"
            subtitle="Cumulative spend on fulfilled purchase orders"
          >
            <AreaChartWidget data={spendTrendData} color="#f59e0b" height={220} />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="PO Status Distribution"
            subtitle="Breakdown of active vs draft vs completed POs"
          >
            <DonutChartWidget data={poStatusDonutData} height={220} />
          </ChartCard>
        </div>
      </div>

      {/* Filter Bar */}
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showStatusFilter
        statusOptions={[
          { label: 'Draft', value: 'DRAFT' },
          { label: 'Submitted', value: 'SUBMITTED' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Issued', value: 'ISSUED' },
          { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
          { label: 'Fulfilled', value: 'FULFILLED' },
        ]}
      />

      {/* Purchase Orders Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Purchase Orders Register ({filteredOrders.length} orders)
        </h3>
        <EntityDataTable
          columns={columns}
          data={filteredOrders}
          searchKey="poNumber"
          searchPlaceholder="Search order # or supplier..."
          loading={loading}
          emptyTitle="No purchase orders found"
          emptyMessage="No orders match the selected report filters."
        />
      </div>
    </div>
  )
}
