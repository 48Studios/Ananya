'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { ShoppingBag, Plus, CheckCircle2, Clock, DollarSign, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatCurrency, formatDate } from '@/lib/utils'

interface SalesOrderRecord {
  id: string
  soNumber: string
  customerName: string
  itemCount: number
  totalAmount: number
  status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'FULFILLED'
  orderDate: string
}

const mockSalesOrders: SalesOrderRecord[] = [
  {
    id: 'so-101',
    soNumber: 'SO-2026-0881',
    customerName: 'AeroTech Systems',
    itemCount: 4,
    totalAmount: 48500,
    status: 'CONFIRMED',
    orderDate: '2026-02-01',
  },
  {
    id: 'so-102',
    soNumber: 'SO-2026-0882',
    customerName: 'Starlight Robotics',
    itemCount: 2,
    totalAmount: 19800,
    status: 'SHIPPED',
    orderDate: '2026-02-03',
  },
  {
    id: 'so-103',
    soNumber: 'SO-2026-0883',
    customerName: 'NexGen Automation',
    itemCount: 8,
    totalAmount: 94200,
    status: 'FULFILLED',
    orderDate: '2026-01-20',
  },
]

export default function SalesOrdersPage() {
  const [orders] = React.useState<SalesOrderRecord[]>(mockSalesOrders)

  const totalValue = orders.reduce((acc, o) => acc + o.totalAmount, 0)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Order Status',
      options: [
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Confirmed', value: 'CONFIRMED' },
        { label: 'Shipped', value: 'SHIPPED' },
        { label: 'Fulfilled', value: 'FULFILLED' },
      ],
    },
  ]

  const columns: ColumnDef<SalesOrderRecord>[] = [
    {
      accessorKey: 'soNumber',
      header: 'Sales Order No.',
      cell: ({ row }) => (
        <Link
          href={`/sales-orders/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.soNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customerName',
      header: 'Customer',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.customerName}</span>,
    },
    {
      accessorKey: 'itemCount',
      header: 'Line Items',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.itemCount} items</span>,
    },
    {
      accessorKey: 'totalAmount',
      header: 'Order Total',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'FULFILLED' || s === 'SHIPPED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {s}
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> Confirmed
          </span>
        )
      },
    },
    {
      accessorKey: 'orderDate',
      header: 'Order Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.orderDate)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/sales-orders/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Order
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Orders"
        description="Create, confirm, and manage customer sales orders and order fulfillment schedules."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Sales Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Orders"
          value={orders.length}
          icon={<ShoppingBag className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Total Booking Value"
          value={formatCurrency(totalValue)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Pending Shipment"
          value={orders.filter((o) => o.status === 'CONFIRMED').length}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={orders}
        columns={columns}
        searchPlaceholder="Search sales orders by SO # or customer..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
