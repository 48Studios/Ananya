'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShoppingCart, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { mrpApi, type PlannedPurchaseOrderDto } from '@/lib/api/mrp-api'

export default function MrpPurchasesPage() {
  const [orders, setOrders] = React.useState<PlannedPurchaseOrderDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    mrpApi.getPurchaseRecommendations()
      .then((data) => setOrders(data || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<PlannedPurchaseOrderDto>[] = [
    {
      accessorKey: 'plannedPoNumber',
      header: 'Planned PO No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.plannedPoNumber || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'supplierName',
      header: 'Suggested Vendor',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.supplierName || 'Primary Vendor'}</span>,
    },
    {
      accessorKey: 'componentSku',
      header: 'Component',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">{row.original.componentSku || '-'}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.componentName || '-'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'quantityToOrder',
      header: 'Order Qty',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.quantityToOrder || 0} units</span>,
    },
    {
      accessorKey: 'releaseDate',
      header: 'Must Release By',
      cell: ({ row }) => <span className="text-xs text-muted-foreground font-mono">{row.original.releaseDate || 'Asap'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="MRP Planned Purchase Orders"
        description="Auto-generated purchasing suggestions required to satisfy upcoming manufacturing demand."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Planned Purchase Orders"
          value={orders.length}
          icon={ShoppingCart}
        />
        <StatCard
          title="Action Needed"
          value={`${orders.length} Suggestions`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Vendor Allocation"
          value="Matched to Approved Vendors"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={orders}
        columns={columns}
        searchPlaceholder="Search planned purchase orders..."
        loading={loading}
        emptyTitle="No Planned Purchase Orders"
        emptyMessage="No component purchase orders currently required."
      />
    </div>
  )
}
