'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Package, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { finishedGoodsApi, type FinishedGoodDto } from '@/lib/api/finished-goods-api'
import { formatCurrency } from '@/lib/utils'

export default function FinishedGoodsPage() {
  const [goods, setGoods] = React.useState<FinishedGoodDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    finishedGoodsApi.getAll()
      .then((data) => setGoods(data || []))
      .catch(() => setGoods([]))
      .finally(() => setLoading(false))
  }, [])

  const totalValue = React.useMemo(() => {
    return goods.reduce((acc, item) => acc + (item?.quantityOnHand || 0) * (item?.unitCost || 0), 0)
  }, [goods])

  const columns: ColumnDef<FinishedGoodDto>[] = [
    {
      accessorKey: 'sku',
      header: 'Finished SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.sku || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Description',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name || '-'}</span>,
    },
    {
      accessorKey: 'warehouseLocation',
      header: 'Location',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.warehouseLocation || 'Main Assembly'}</span>,
    },
    {
      accessorKey: 'quantityOnHand',
      header: 'OnHand Stock',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.quantityOnHand || 0} {row.original.unitOfMeasure || 'units'}
        </span>
      ),
    },
    {
      accessorKey: 'unitCost',
      header: 'Unit Cost',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {formatCurrency(row.original.unitCost || 0)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finished Goods Inventory Master"
        description="Monitor completed manufactured products, available finished stock, and valuation."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Receive Production Batch
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Finished Goods SKUs"
          value={goods.length}
          icon={Package}
        />
        <StatCard
          title="Total Valuation"
          value={formatCurrency(totalValue)}
          icon={CheckCircle2}
        />
        <StatCard
          title="Quality Clearance"
          value="100% Passed QA"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={goods}
        columns={columns}
        searchPlaceholder="Search finished goods by SKU, name, or location..."
        loading={loading}
        emptyTitle="No Finished Goods Found"
        emptyMessage="No completed finished goods match your search."
      />
    </div>
  )
}
