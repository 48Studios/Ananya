'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { TrendingUp, Plus, CheckCircle2, Clock, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatCurrency, formatDate } from '@/lib/utils'

interface OpportunityRecord {
  id: string
  dealName: string
  accountName: string
  expectedValue: number
  probability: string
  stage: 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON'
  closeDate: string
}

const mockOpps: OpportunityRecord[] = [
  { id: 'opp-1', dealName: 'AeroTech Spindle Supply Q3', accountName: 'AeroTech Systems', expectedValue: 145000, probability: '85%', stage: 'NEGOTIATION', closeDate: '2026-03-31' },
  { id: 'opp-2', dealName: 'Starlight Sensor Upgrade Contract', accountName: 'Starlight Robotics', expectedValue: 89000, probability: '60%', stage: 'PROPOSAL', closeDate: '2026-04-15' },
]

export default function OpportunitiesPage() {
  const [opps] = React.useState<OpportunityRecord[]>(mockOpps)

  const totalValue = opps.reduce((acc, o) => acc + o.expectedValue, 0)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'stage',
      label: 'Deal Stage',
      options: [
        { label: 'Qualification', value: 'QUALIFICATION' },
        { label: 'Proposal', value: 'PROPOSAL' },
        { label: 'Negotiation', value: 'NEGOTIATION' },
        { label: 'Closed Won', value: 'CLOSED_WON' },
      ],
    },
  ]

  const columns: ColumnDef<OpportunityRecord>[] = [
    {
      accessorKey: 'dealName',
      header: 'Opportunity Deal Name',
      cell: ({ row }) => (
        <Link href={`/opportunities/${row.original.id}`} className="font-semibold text-xs text-primary hover:underline">
          {row.original.dealName}
        </Link>
      ),
    },
    {
      accessorKey: 'accountName',
      header: 'Account / Customer',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.accountName}</span>,
    },
    {
      accessorKey: 'expectedValue',
      header: 'Deal Value',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.expectedValue)}
        </span>
      ),
    },
    {
      accessorKey: 'probability',
      header: 'Win Rate',
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">{row.original.probability}</span>,
    },
    {
      accessorKey: 'stage',
      header: 'Stage',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          {row.original.stage}
        </span>
      ),
    },
    {
      accessorKey: 'closeDate',
      header: 'Target Close',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.closeDate)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/opportunities/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> Deal Details
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Opportunities & Deal Pipeline"
        description="Track active commercial deals, win probabilities, forecasted contract values, and closing dates."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Opportunity
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Opportunities"
          value={opps.length}
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(totalValue)}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Weighted Forecast"
          value={formatCurrency(Math.round(totalValue * 0.75))}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={opps}
        columns={columns}
        searchPlaceholder="Search opportunities by deal name or account..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
