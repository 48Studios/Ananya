'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Factory,
  CheckCircle2,
  AlertOctagon,
  FileSpreadsheet,
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
import { reportingApi, ManufacturingSummaryDto } from '@/lib/api/reporting-api'
import { workOrdersApi, WorkOrderDto } from '@/lib/api/work-orders-api'

export default function ManufacturingReportsPage() {
  const [summary, setSummary] = React.useState<ManufacturingSummaryDto | null>(null)
  const [woList, setWoList] = React.useState<WorkOrderDto[]>([])
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
      const [sumData, woData] = await Promise.all([
        reportingApi.getManufacturingSummary(),
        workOrdersApi.getAll(),
      ])
      setSummary(sumData)
      setWoList(woData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load manufacturing report data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredOrders = React.useMemo(() => {
    return woList.filter((wo) => {
      if (filters.status && wo.status !== filters.status) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matchWo = wo.productionNumber.toLowerCase().includes(query)
        if (!matchWo) return false
      }
      return true
    })
  }, [woList, filters])

  const columns = React.useMemo<ColumnDef<WorkOrderDto>[]>(
    () => [
      {
        accessorKey: 'productionNumber',
        header: 'WO #',
        cell: ({ row }) => (
          <Link
            href={`/work-orders/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted font-bold inline-flex items-center gap-1 uppercase"
          >
            {row.original.productionNumber}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            {row.original.status}
          </span>
        ),
      },
      {
        accessorKey: 'quantityPlanned',
        header: 'Planned / Completed',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.quantityCompleted} / {row.original.quantityPlanned} units
          </span>
        ),
      },
      {
        accessorKey: 'quantityScrapped',
        header: 'Scrap',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-rose-600 dark:text-rose-400">
            {row.original.quantityScrapped} units
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
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
          <Link href={`/work-orders/${row.original.id}`}>
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
    return <LoadingState message="Aggregating Manufacturing reports..." />
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Manufacturing Report Error"
        message={error || 'Unable to load production analytics.'}
        onRetry={loadData}
      />
    )
  }

  const woStatusData = [
    { name: 'Active WOs', value: summary.activeWorkOrders, color: '#10b981' },
    { name: 'Completed WOs', value: summary.completedWorkOrders, color: '#0ea5e9' },
    { name: 'Other Status', value: Math.max(0, summary.totalWorkOrders - summary.activeWorkOrders - summary.completedWorkOrders), color: '#94a3b8' },
  ]

  const outputVsScrapData = [
    { name: 'Finished Output', value: summary.totalProductionOutput ?? 0 },
    { name: 'Scrap Generated', value: summary.totalScrapQuantity ?? 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Manufacturing Reports"
        description="Production execution, output yield, material consumption, and scrap analysis."
        breadcrumbs={[
          { label: 'Reports', href: '/reports' },
          { label: 'Manufacturing Reports' },
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
          title="Total Work Orders"
          value={summary.totalWorkOrders}
          subtitle={`${summary.activeWorkOrders} in progress`}
          icon={Factory}
        />
        <StatCard
          title="Production Output"
          value={`${summary.totalProductionOutput} units`}
          subtitle="Completed finished goods"
          icon={CheckCircle2}
        />
        <StatCard
          title="Total Scrap Generated"
          value={`${summary.totalScrapQuantity} units`}
          subtitle="Material scrap recorded"
          icon={AlertOctagon}
        />
        <StatCard
          title="Bill of Materials (BOM)"
          value={summary.totalBoms}
          subtitle={`${summary.activeBoms} active RELEASED BOMs`}
          icon={FileSpreadsheet}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Production Yield vs Scrap"
            subtitle="Comparison of completed units vs scrapped materials"
          >
            <BarChartWidget data={outputVsScrapData} color="#10b981" height={220} />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Work Order Status Ratio"
            subtitle="Active vs completed vs planned production jobs"
          >
            <DonutChartWidget data={woStatusData} height={220} />
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
          { label: 'Released', value: 'RELEASED' },
          { label: 'In Progress', value: 'IN_PROGRESS' },
          { label: 'Paused', value: 'PAUSED' },
          { label: 'Completed', value: 'COMPLETED' },
        ]}
      />

      {/* Work Orders Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Work Orders Register ({filteredOrders.length} orders)
        </h3>
        <EntityDataTable
          columns={columns}
          data={filteredOrders}
          searchKey="productionNumber"
          searchPlaceholder="Search work order #..."
          loading={loading}
          emptyTitle="No work orders found"
          emptyMessage="No production jobs match the selected report filters."
        />
      </div>
    </div>
  )
}
