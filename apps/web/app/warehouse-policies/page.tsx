'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldCheck, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'

interface WarehousePolicy {
  id: string
  policyName: string
  warehouseName: string
  pickingRule: 'FIFO' | 'FEFO' | 'LIFO' | 'ZONE_BASED'
  putawayRule: 'FAST_MOVING_FRONT' | 'VOLUME_MATCHED' | 'DIRECT_TO_BIN'
  isActive: boolean
}

const mockPolicies: WarehousePolicy[] = [
  {
    id: 'pol-1',
    policyName: 'Electronics FIFO Picking Policy',
    warehouseName: 'Main Assembly WH',
    pickingRule: 'FIFO',
    putawayRule: 'FAST_MOVING_FRONT',
    isActive: true,
  },
  {
    id: 'pol-2',
    policyName: 'Chemical & Paste FEFO Expiry Rule',
    warehouseName: 'Raw Materials WH',
    pickingRule: 'FEFO',
    putawayRule: 'VOLUME_MATCHED',
    isActive: true,
  },
]

export default function WarehousePoliciesPage() {
  const [policies] = React.useState<WarehousePolicy[]>(mockPolicies)

  const columns: ColumnDef<WarehousePolicy>[] = [
    {
      accessorKey: 'policyName',
      header: 'Policy Rule Name',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.policyName}</span>,
    },
    {
      accessorKey: 'warehouseName',
      header: 'Applies to Facility',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.warehouseName}</span>,
    },
    {
      accessorKey: 'pickingRule',
      header: 'Picking Strategy',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.pickingRule}
        </span>
      ),
    },
    {
      accessorKey: 'putawayRule',
      header: 'Putaway Strategy',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.putawayRule}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Active Policy
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Policies & Picking Rules"
        description="Configure FIFO, FEFO, putaway strategies, and automated bin selection rules."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Storage Policy
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Storage Policies"
          value={policies.length}
          icon={ShieldCheck}
        />
        <StatCard
          title="Default Picking Rule"
          value="FIFO Strategy"
          icon={CheckCircle2}
        />
        <StatCard
          title="Expiry Enforced"
          value="FEFO Enabled"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={policies}
        columns={columns}
        searchPlaceholder="Search policies by name, picking strategy, or facility..."
      />
    </div>
  )
}
