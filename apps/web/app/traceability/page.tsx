'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { GitCommit, Search, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface TraceNode {
  id: string
  identifier: string
  entityType: 'LOT' | 'SERIAL' | 'WORK_ORDER' | 'SUPPLIER_PO'
  sourceSupplier: string
  usedInAssembly: string
  eventTimestamp: string
}

const mockTraceNodes: TraceNode[] = [
  {
    id: 't-1',
    identifier: 'BAT-2026-0811',
    entityType: 'LOT',
    sourceSupplier: 'Global Microelectronics Co.',
    usedInAssembly: 'WO-2026-001 (Arm Assembly)',
    eventTimestamp: '2026-01-15T08:00:00Z',
  },
  {
    id: 't-2',
    identifier: 'SN-772910-A',
    entityType: 'SERIAL',
    sourceSupplier: 'Internal Precision Fabrication',
    usedInAssembly: 'WO-2026-002 (Control Box)',
    eventTimestamp: '2026-01-20T11:30:00Z',
  },
]

export default function TraceabilityPage() {
  const [nodes] = React.useState<TraceNode[]>(mockTraceNodes)
  const [searchQuery, setSearchQuery] = React.useState('')

  const columns: ColumnDef<TraceNode>[] = [
    {
      accessorKey: 'identifier',
      header: 'Lot / Serial / Order Identifier',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.identifier}
        </span>
      ),
    },
    {
      accessorKey: 'entityType',
      header: 'Genealogy Type',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.entityType}
        </span>
      ),
    },
    {
      accessorKey: 'sourceSupplier',
      header: 'Upstream Origin',
      cell: ({ row }) => <span className="text-xs text-foreground font-medium">{row.original.sourceSupplier}</span>,
    },
    {
      accessorKey: 'usedInAssembly',
      header: 'Downstream Usage',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.usedInAssembly}</span>,
    },
    {
      accessorKey: 'eventTimestamp',
      header: 'Logged Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.eventTimestamp)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lot & Serial Genealogy Traceability"
        description="End-to-end forward and backward component lineage, supplier provenance, and assembly usage history."
      />

      <div className="p-4 bg-card border border-border rounded-xl space-y-3">
        <label className="text-xs font-semibold text-foreground">Trace Any Barcode, Lot #, or Serial #</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type or scan Lot BAT-..., Serial SN-..., or PO #..."
            className="flex-1 px-3 py-2 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
          <Button size="sm">
            <Search className="w-4 h-4 mr-1.5" />
            Trace Lineage
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Tracked Records"
          value={nodes.length}
          icon={<GitCommit className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Genealogy Coverage"
          value="100% Upstream"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Trace Compliance"
          value="Audit Certified"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={nodes}
        columns={columns}
        searchPlaceholder="Filter genealogy records..."
      />
    </div>
  )
}
