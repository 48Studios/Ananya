'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { TrendingUp, Plus, DollarSign, ShoppingBag, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { formatCurrency } from '@/lib/utils'

interface SalesSummaryItem {
  id: string
  category: string
  activeOrders: number
  totalRevenue: number
  growthPercentage: string
}

const mockSalesData: SalesSummaryItem[] = [
  { id: 's-1', category: 'Precision Motors & Actuators', activeOrders: 14, totalRevenue: 142000, growthPercentage: '+18.4%' },
  { id: 's-2', category: 'Optical Sensors & Controls', activeOrders: 8, totalRevenue: 89000, growthPercentage: '+12.1%' },
  { id: 's-3', category: 'Custom Heavy Assemblies', activeOrders: 5, totalRevenue: 215000, growthPercentage: '+24.5%' },
]

export default function SalesPage() {
  const [items] = React.useState<SalesSummaryItem[]>(mockSalesData)

  const totalRevenue = items.reduce((acc, i) => acc + i.totalRevenue, 0)
  const totalOrders = items.reduce((acc, i) => acc + i.activeOrders, 0)

  const columns: ColumnDef<SalesSummaryItem>[] = [
    {
      accessorKey: 'category',
      header: 'Sales Product Category',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.category}</span>,
    },
    {
      accessorKey: 'activeOrders',
      header: 'Active Orders',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-semibold">{row.original.activeOrders} orders</span>,
    },
    {
      accessorKey: 'totalRevenue',
      header: 'Category Revenue',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalRevenue)}
        </span>
      ),
    },
    {
      accessorKey: 'growthPercentage',
      header: 'YoY Growth',
      cell: ({ row }) => (
        <span className="inline-flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="w-3.5 h-3.5 mr-1" /> {row.original.growthPercentage}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Executive Dashboard"
        description="Monitor sales orders, customer revenue streams, order pipeline growth, and product category performance."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Sales Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total YTD Sales Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Active Open Sales Orders"
          value={totalOrders}
          icon={<ShoppingBag className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Fulfillment Target Rate"
          value="98.2%"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={items}
        columns={columns}
        searchPlaceholder="Search sales categories..."
      />
    </div>
  )
}
