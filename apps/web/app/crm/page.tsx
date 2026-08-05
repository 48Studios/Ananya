'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Users, Plus, TrendingUp, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface CrmStageSummary {
  id: string
  stageName: string
  opportunityCount: number
  totalPipelineValue: number
  conversionProbability: string
}

const mockCrmStages: CrmStageSummary[] = [
  { id: 'c-1', stageName: 'Discovery & Lead Qualification', opportunityCount: 14, totalPipelineValue: 240000, conversionProbability: '25%' },
  { id: 'c-2', stageName: 'Proposal & Commercial Quotation', opportunityCount: 8, totalPipelineValue: 380000, conversionProbability: '60%' },
  { id: 'c-3', stageName: 'Contract Negotiation', opportunityCount: 5, totalPipelineValue: 410000, conversionProbability: '85%' },
]

export default function CrmPage() {
  const [stages] = React.useState<CrmStageSummary[]>(mockCrmStages)

  const totalPipeline = stages.reduce((acc, s) => acc + s.totalPipelineValue, 0)
  const totalDeals = stages.reduce((acc, s) => acc + s.opportunityCount, 0)

  const columns: ColumnDef<CrmStageSummary>[] = [
    {
      accessorKey: 'stageName',
      header: 'Pipeline Stage',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.stageName}</span>,
    },
    {
      accessorKey: 'opportunityCount',
      header: 'Active Deals',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.opportunityCount} deals</span>,
    },
    {
      accessorKey: 'totalPipelineValue',
      header: 'Stage Value',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.totalPipelineValue)}
        </span>
      ),
    },
    {
      accessorKey: 'conversionProbability',
      header: 'Win Probability',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {row.original.conversionProbability}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM & Sales Pipeline Hub"
        description="Manage customer relationships, sales leads, deal opportunity pipelines, and revenue conversion."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add New Lead / Deal
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Pipeline Value"
          value={formatCurrency(totalPipeline)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Active Opportunities"
          value={totalDeals}
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Qualified Leads"
          value="27 Prospects"
          icon={<Users className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={stages}
        columns={columns}
        searchPlaceholder="Search CRM pipeline stages..."
      />
    </div>
  )
}
