'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { PackageCheck, Plus, CheckCircle2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface FinishedGood {
  id: string
  productCode: string
  productName: string
  onHandQuantity: number
  reservedQuantity: number
  unitPrice: number
  warehouseLocation: string
}

const mockFinishedGoods: FinishedGood[] = [
  {
    id: 'fg-1',
    productCode: 'FG-ASY-900',
    productName: 'Automated Robotic Arm Unit 6-Axis',
    onHandQuantity: 8,
    reservedQuantity: 3,
    unitPrice: 28500,
    warehouseLocation: 'Finished Goods WH / Zone A',
  },
  {
    id: 'fg-2',
    productCode: 'FG-CTRL-400',
    productName: 'Industrial PLC Machine Control Cabinet',
    onHandQuantity: 15,
    reservedQuantity: 5,
    unitPrice: 12400,
    warehouseLocation: 'Finished Goods WH / Zone B',
  },
]

export default function FinishedGoodsPage() {
  const [goods] = React.useState<FinishedGood[]>(mockFinishedGoods)

  const totalValue = goods.reduce((acc, g) => acc + g.onHandQuantity * g.unitPrice, 0)

  const columns: ColumnDef<FinishedGood>[] = [
    {
      accessorKey: 'productCode',
      header: 'Product Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.productCode}
        </span>
      ),
    },
    {
      accessorKey: 'productName',
      header: 'Finished Product Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.productName}</span>,
    },
    {
      accessorKey: 'onHandQuantity',
      header: 'Available Stock',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.onHandQuantity - row.original.reservedQuantity} available ({row.original.onHandQuantity} total)
        </span>
      ),
    },
    {
      accessorKey: 'unitPrice',
      header: 'Unit Selling Price',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.unitPrice)}
        </span>
      ),
    },
    {
      accessorKey: 'warehouseLocation',
      header: 'Location Path',
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.warehouseLocation}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finished Goods Inventory"
        description="Monitor completed product assemblies, ready-for-shipment stock, and inventory valuation."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Receive Production Yield
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Finished Product SKUs"
          value={goods.length}
          icon={<PackageCheck className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Total Valuation"
          value={formatCurrency(totalValue)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Fulfillment Ready"
          value="100% Stocked"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={goods}
        columns={columns}
        searchPlaceholder="Search finished goods by product code, name, or location..."
      />
    </div>
  )
}
