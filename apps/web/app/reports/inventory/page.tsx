'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Boxes,
  MapPin,
  Layers,
  ArrowLeft,
  CheckCircle2,
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
import { reportingApi, InventorySummaryDto } from '@/lib/api/reporting-api'
import { componentsApi, ComponentDto } from '@/lib/api/components-api'
import { formatNumber, formatQuantity, formatDate } from '@/lib/utils'

export default function InventoryReportsPage() {
  const [summary, setSummary] = React.useState<InventorySummaryDto | null>(null)
  const [componentList, setComponentList] = React.useState<ComponentDto[]>([])
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
      const [sumData, compData] = await Promise.all([
        reportingApi.getInventorySummary(),
        componentsApi.getAll(),
      ])
      setSummary(sumData)
      setComponentList(compData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory reporting data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredComponents = React.useMemo(() => {
    return componentList.filter((item) => {
      if (filters.status === 'active' && !item.isActive) return false
      if (filters.status === 'inactive' && item.isActive) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matchSku = item.sku.toLowerCase().includes(query)
        const matchName = item.name.toLowerCase().includes(query)
        if (!matchSku && !matchName) return false
      }
      return true
    })
  }, [componentList, filters])

  const columns = React.useMemo<ColumnDef<ComponentDto>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU / Code',
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted font-bold inline-flex items-center gap-1 uppercase"
          >
            {row.original.sku}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Component Name',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-foreground">{row.original.name}</span>
            {row.original.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'unit',
        header: 'UOM',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground uppercase">{row.original.unit}</span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
              row.original.isActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-muted text-muted-foreground border border-border'
            }`}
          >
            {row.original.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Added Date',
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
          <Link href={`/components/${row.original.id}`}>
            <Button variant="ghost" size="xs">
              View Item
            </Button>
          </Link>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return <LoadingState message="Aggregating Inventory reports..." />
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Inventory Report Error"
        message={error || 'Unable to render inventory analytics.'}
        onRetry={loadData}
      />
    )
  }

  const locationChartData = [
    { name: 'Active SKUs', value: summary.activeComponents ?? 0 },
    { name: 'Reserved Stock', value: summary.reservedQuantity ?? 0 },
    { name: 'Adjustments', value: summary.totalAdjustments ?? 0 },
    { name: 'Transfers', value: summary.totalTransfers ?? 0 },
  ]

  const statusDonutData = [
    { name: 'Active Items', value: summary.activeComponents ?? 0, color: '#10b981' },
    { name: 'Inactive Items', value: Math.max(0, (summary.totalComponents ?? 0) - (summary.activeComponents ?? 0)), color: '#64748b' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory Reports"
        description="Comprehensive stock levels, storage location distributions, and component valuation."
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
          title="Total Catalog Items"
          value={formatNumber(summary.totalComponents)}
          subtitle={`${formatNumber(summary.activeComponents)} active components`}
          icon={Boxes}
        />
        <StatCard
          title="Storage Locations"
          value={formatNumber(summary.activeLocations)}
          subtitle="Warehouse facilities"
          icon={MapPin}
        />
        <StatCard
          title="Reserved Inventory"
          value={formatQuantity(summary.reservedQuantity, 'units')}
          subtitle="Committed to WO/Projects"
          icon={Layers}
        />
        <StatCard
          title="Stock Adjustments"
          value={summary.totalAdjustments}
          subtitle={`${summary.totalTransfers} warehouse transfers`}
          icon={CheckCircle2}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Stock Distribution by Location"
            subtitle="Current component balance per warehouse section"
          >
            <BarChartWidget data={locationChartData} color="#0ea5e9" height={220} />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Component Status Ratio"
            subtitle="Active vs inactive catalog items"
          >
            <DonutChartWidget data={statusDonutData} height={220} />
          </ChartCard>
        </div>
      </div>

      {/* Filter Bar */}
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showStatusFilter
        statusOptions={[
          { label: 'Active Components', value: 'active' },
          { label: 'Inactive Components', value: 'inactive' },
        ]}
      />

      {/* Entity Table with Drill-Down Links */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Current Stock Catalog ({filteredComponents.length} items)
        </h3>
        <EntityDataTable
          columns={columns}
          data={filteredComponents}
          searchKey="sku"
          searchPlaceholder="Search component by SKU or name..."
          loading={loading}
          emptyTitle="No components found"
          emptyMessage="No catalog items match the applied report filters."
        />
      </div>
    </div>
  )
}
