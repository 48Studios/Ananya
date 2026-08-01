'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  FolderKanban,
  Package,
  Layers,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
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
import { reportingApi, ProjectSummaryDto } from '@/lib/api/reporting-api'
import { projectsApi, ProjectDto } from '@/lib/api/projects-api'

export default function ProjectReportsPage() {
  const [summary, setSummary] = React.useState<ProjectSummaryDto | null>(null)
  const [projectList, setProjectList] = React.useState<ProjectDto[]>([])
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
      const [sumData, projData] = await Promise.all([
        reportingApi.getProjectSummary(),
        projectsApi.getAll(),
      ])
      setSummary(sumData)
      setProjectList(projData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project report data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filteredProjects = React.useMemo(() => {
    return projectList.filter((proj) => {
      if (filters.status && proj.status !== filters.status) return false
      if (filters.search) {
        const query = filters.search.toLowerCase()
        const matchNum = proj.projectNumber.toLowerCase().includes(query)
        const matchName = proj.name.toLowerCase().includes(query)
        if (!matchNum && !matchName) return false
      }
      return true
    })
  }, [projectList, filters])

  const columns = React.useMemo<ColumnDef<ProjectDto>[]>(
    () => [
      {
        accessorKey: 'projectNumber',
        header: 'Project #',
        cell: ({ row }) => (
          <Link
            href={`/projects/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted font-bold inline-flex items-center gap-1 uppercase"
          >
            {row.original.projectNumber}
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </Link>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Project Name',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-foreground">{row.original.name}</span>
            <p className="text-[11px] text-muted-foreground">{row.original.projectManager}</p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'materials',
        header: 'Material Lines',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.materials.length} items
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
          <Link href={`/projects/${row.original.id}`}>
            <Button variant="ghost" size="xs">
              View Project
            </Button>
          </Link>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return <LoadingState message="Aggregating Project reports..." />
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Project Report Error"
        message={error || 'Unable to load project material analytics.'}
        onRetry={loadData}
      />
    )
  }

  const projectStatusData = [
    { name: 'Active Projects', value: summary.activeProjects, color: '#8b5cf6' },
    { name: 'Completed Projects', value: summary.completedProjects, color: '#10b981' },
    { name: 'Planning / Other', value: Math.max(0, summary.totalProjects - summary.activeProjects - summary.completedProjects), color: '#94a3b8' },
  ]

  const materialBalanceData = [
    { name: 'Allocated', value: summary.totalAllocatedMaterials },
    { name: 'Issued', value: summary.totalIssuedMaterials },
    { name: 'Returned', value: summary.totalReturnedMaterials },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Project Reports"
        description="Project material tracking, job site inventory allocations, and consumption balances."
        breadcrumbs={[
          { label: 'Reports', href: '/reports' },
          { label: 'Project Reports' },
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
          title="Total Projects"
          value={summary.totalProjects}
          subtitle={`${summary.activeProjects} active projects`}
          icon={FolderKanban}
        />
        <StatCard
          title="Allocated Materials"
          value={`${summary.totalAllocatedMaterials} units`}
          subtitle="Reserved project stock"
          icon={Package}
        />
        <StatCard
          title="Issued Materials"
          value={`${summary.totalIssuedMaterials} units`}
          subtitle="Consumed at job sites"
          icon={Layers}
        />
        <StatCard
          title="Returned Materials"
          value={`${summary.totalReturnedMaterials} units`}
          subtitle="Returned to warehouse"
          icon={CheckCircle2}
        />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <ChartCard
            title="Project Material Lifecycle Balance"
            subtitle="Allocated vs Issued vs Returned material quantities"
          >
            <BarChartWidget data={materialBalanceData} color="#8b5cf6" height={220} />
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Project Status Distribution"
            subtitle="Active vs completed vs planning initiatives"
          >
            <DonutChartWidget data={projectStatusData} height={220} />
          </ChartCard>
        </div>
      </div>

      {/* Filter Bar */}
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showStatusFilter
        statusOptions={[
          { label: 'Planning', value: 'PLANNING' },
          { label: 'Active', value: 'ACTIVE' },
          { label: 'On Hold', value: 'ON_HOLD' },
          { label: 'Completed', value: 'COMPLETED' },
        ]}
      />

      {/* Projects Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Projects Register ({filteredProjects.length} projects)
        </h3>
        <EntityDataTable
          columns={columns}
          data={filteredProjects}
          searchKey="projectNumber"
          searchPlaceholder="Search project # or name..."
          loading={loading}
          emptyTitle="No projects found"
          emptyMessage="No project records match the selected report filters."
        />
      </div>
    </div>
  )
}
