'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, X, Eye, Package, Building2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { GoodsReceiptForm } from '@/components/goods-receipts/gr-form'
import { goodsReceiptsApi, type GoodsReceiptDto } from '@/lib/api/goods-receipts-api'
import { purchaseOrdersApi, type PurchaseOrderDto } from '@/lib/api/purchase-orders-api'
import { suppliersApi, type SupplierDto } from '@/lib/api/suppliers-api'

export default function GoodsReceiptsPage() {
  const [receipts, setReceipts] = React.useState<GoodsReceiptDto[]>([])
  const [purchaseOrdersMap, setPurchaseOrdersMap] = React.useState<Record<string, PurchaseOrderDto>>({})
  const [suppliersMap, setSuppliersMap] = React.useState<Record<string, SupplierDto>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [toastMessage, setToastMessage] = React.useState<string | null>(null)

  const fetchReceipts = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [grs, pos, sups] = await Promise.all([
        goodsReceiptsApi.getAll(),
        purchaseOrdersApi.getAll().catch(() => []),
        suppliersApi.getAll().catch(() => []),
      ])
      setReceipts(grs)

      const poMap: Record<string, PurchaseOrderDto> = {}
      for (const p of pos) poMap[p.id] = p
      setPurchaseOrdersMap(poMap)

      const supMap: Record<string, SupplierDto> = {}
      for (const s of sups) supMap[s.id] = s
      setSuppliersMap(supMap)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to fetch Goods Receipts')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  const totalQtyReceivedOverall = React.useMemo(
    () =>
      receipts.reduce(
        (acc, gr) => acc + gr.lines.reduce((lAcc, line) => lAcc + line.quantityReceived, 0),
        0,
      ),
    [receipts],
  )

  const columns = React.useMemo<ColumnDef<GoodsReceiptDto>[]>(
    () => [
      {
        accessorKey: 'grNumber',
        header: 'GRN Number',
        cell: ({ row }) => (
          <Link
            href={`/goods-receipts/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase"
          >
            {row.original.grNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'purchaseOrderId',
        header: 'Purchase Order',
        cell: ({ row }) => {
          const po = purchaseOrdersMap[row.original.purchaseOrderId]
          return (
            <Link
              href={`/purchase-orders/${row.original.purchaseOrderId}`}
              className="font-mono text-xs text-foreground hover:underline"
            >
              {po ? po.poNumber : row.original.purchaseOrderId.slice(0, 8)}
            </Link>
          )
        },
      },
      {
        accessorKey: 'supplierId',
        header: 'Supplier',
        cell: ({ row }) => {
          const sup = suppliersMap[row.original.supplierId]
          return (
            <span className="font-medium text-foreground">
              {sup ? sup.name : row.original.supplierId.slice(0, 8)}
            </span>
          )
        },
      },
      {
        accessorKey: 'packingSlipNumber',
        header: 'Packing Slip #',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground uppercase">
            {row.original.packingSlipNumber || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'lines',
        header: 'Qty Received',
        cell: ({ row }) => {
          const sum = row.original.lines.reduce((acc, l) => acc + l.quantityReceived, 0)
          return <span className="font-mono text-xs font-bold text-foreground">{sum} units</span>
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            {row.original.status}
          </span>
        ),
      },
      {
        accessorKey: 'receivedAt',
        header: 'Receipt Date',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.receivedAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/goods-receipts/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [purchaseOrdersMap, suppliersMap],
  )

  const filterConfigs: FilterConfig[] = [
    {
      columnId: 'status',
      title: 'Status',
      options: [
        { label: 'Completed', value: 'COMPLETED' },
        { label: 'Draft', value: 'DRAFT' },
      ],
    },
  ]

  const handleFormSuccess = (savedGr: GoodsReceiptDto) => {
    setReceipts((prev) => [savedGr, ...prev])
    setToastMessage(`Goods Receipt "${savedGr.grNumber}" posted successfully. Stock incremented.`)
    setIsFormOpen(false)
    setTimeout(() => setToastMessage(null), 4000)
    fetchReceipts()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Goods Receipts (GRN)"
        description="Physical inventory receipt processing against Purchase Orders with automatic stock increments and ledger posting."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Receive Goods
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Goods Receipts"
          value={receipts.length}
          subtitle="Processed receiving notes"
          icon={Package}
        />
        <StatCard
          title="Completed Receipts"
          value={receipts.filter((r) => r.status === 'COMPLETED').length}
          subtitle="Inventory ledger posted"
          icon={Package}
        />
        <StatCard
          title="Total Items Received"
          value={`${totalQtyReceivedOverall} units`}
          subtitle="Total units added to stock"
          icon={Building2}
        />
      </div>

      {/* Notifications */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchReceipts}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Receiving Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                Receive Goods against Purchase Order
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <GoodsReceiptForm
              onSuccess={handleFormSuccess}
              onCancel={() => setIsFormOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={receipts}
        searchKey="grNumber"
        searchPlaceholder="Search goods receipts by GRN number..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No goods receipts found"
        emptyMessage="Get started by processing your first physical inventory receipt."
      />
    </div>
  )
}
