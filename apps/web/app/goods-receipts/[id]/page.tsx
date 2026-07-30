'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Printer,
  Building2,
  Calendar,
  Package,
  Layers,
  MapPin,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { goodsReceiptsApi, type GoodsReceiptDto } from '@/lib/api/goods-receipts-api'
import { purchaseOrdersApi, type PurchaseOrderDto } from '@/lib/api/purchase-orders-api'
import { suppliersApi, type SupplierDto } from '@/lib/api/suppliers-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

export default function ViewGoodsReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [gr, setGr] = React.useState<GoodsReceiptDto | null>(null)
  const [po, setPo] = React.useState<PurchaseOrderDto | null>(null)
  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null)
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [locationsMap, setLocationsMap] = React.useState<Record<string, LocationDto>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const grData = await goodsReceiptsApi.getById(id)
      setGr(grData)

      const [poData, supData, comps, locs] = await Promise.all([
        purchaseOrdersApi.getById(grData.purchaseOrderId).catch(() => null),
        suppliersApi.getById(grData.supplierId).catch(() => null),
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ])

      if (poData) setPo(poData)
      if (supData) setSupplier(supData)

      const compMap: Record<string, ComponentDto> = {}
      for (const c of comps) compMap[c.id] = c
      setComponentsMap(compMap)

      const locMap: Record<string, LocationDto> = {}
      for (const l of locs) locMap[l.id] = l
      setLocationsMap(locMap)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load Goods Receipt details')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const poLinesMap = React.useMemo(() => {
    const map: Record<string, { quantityOrdered: number; quantityReceived: number }> = {}
    if (po) {
      for (const l of po.lines) {
        map[l.id] = {
          quantityOrdered: l.quantityOrdered,
          quantityReceived: l.quantityReceived,
        }
      }
    }
    return map
  }, [po])

  if (loading) {
    return <LoadingState message="Loading Goods Receipt details..." />
  }

  if (error || !gr) {
    return (
      <ErrorState
        title="Goods Receipt Not Found"
        message={error || 'The requested Goods Receipt record does not exist.'}
        onRetry={fetchData}
      />
    )
  }

  const totalQtyReceived = gr.lines.reduce((acc, l) => acc + l.quantityReceived, 0)

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={gr.grNumber}
        description={`Purchase Order: ${po?.poNumber || gr.purchaseOrderId}`}
        breadcrumbs={[
          { label: 'Goods Receipts', href: '/goods-receipts' },
          { label: gr.grNumber },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => router.push('/goods-receipts')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>
          </div>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Total Quantity Received"
          value={`${totalQtyReceived} units`}
          subtitle="Physical inventory incremented"
          icon={Package}
        />
        <StatCard
          title="Received Line Items"
          value={gr.lines.length}
          subtitle="Received component lines"
          icon={Layers}
        />
        <StatCard
          title="Supplier"
          value={supplier?.code || gr.supplierId.slice(0, 8)}
          subtitle={supplier?.name || 'Vendor record'}
          icon={Building2}
        />
        <StatCard
          title="Receipt Date"
          value={new Date(gr.receivedAt).toLocaleDateString()}
          subtitle="Physical arrival timestamp"
          icon={Calendar}
        />
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata Info */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-foreground">Goods Receipt Overview</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receiving document metadata and Purchase Order references.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">GRN Number</dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {gr.grNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {gr.status}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Purchase Order</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {po ? (
                  <Link href={`/purchase-orders/${po.id}`} className="hover:underline font-mono">
                    {po.poNumber} ({po.status})
                  </Link>
                ) : (
                  gr.purchaseOrderId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Supplier Name</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {supplier ? (
                  <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
                    {supplier.name} ({supplier.code})
                  </Link>
                ) : (
                  gr.supplierId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Packing Slip / Delivery Note #</dt>
              <dd className="mt-1 font-mono text-xs text-foreground uppercase">
                {gr.packingSlipNumber || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Arrival Timestamp</dt>
              <dd className="mt-1 text-xs text-foreground">
                {new Date(gr.receivedAt).toLocaleString()}
              </dd>
            </div>
          </dl>

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(gr.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(gr.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Stock Ledger Status Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">Inventory Integration</h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-400 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Immutable Ledger Updated
              </div>
              <p className="text-[11px] opacity-90">
                Inbound receipt transactions created in the inventory ledger. Stock balances automatically increased at target locations.
              </p>
            </div>

            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ledger Ref:</span>
                <span className="text-foreground">{gr.grNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Units Received:</span>
                <span className="font-bold text-foreground">{totalQtyReceived}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Received Line Items Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Received Components ({gr.lines.length})
        </h3>

        {gr.lines.length > 0 ? (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Component</th>
                  <th className="p-3">Destination Storage Location</th>
                  <th className="p-3 text-right">Ordered Qty</th>
                  <th className="p-3 text-right">Received This GRN</th>
                  <th className="p-3 text-right">Total Received to Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gr.lines.map((line, idx) => {
                  const comp = componentsMap[line.componentId]
                  const loc = locationsMap[line.locationId]
                  const poLineInfo = poLinesMap[line.poLineId]

                  return (
                    <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="p-3">
                        {comp ? (
                          <Link
                            href={`/components/${comp.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {comp.name}{' '}
                            <span className="font-mono text-muted-foreground text-[11px]">
                              ({comp.sku})
                            </span>
                          </Link>
                        ) : (
                          <span className="font-mono">{line.componentId}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {loc ? (
                          <span className="flex items-center gap-1 text-foreground font-medium">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            {loc.name} <span className="font-mono text-muted-foreground text-[11px]">({loc.code})</span>
                          </span>
                        ) : (
                          <span className="font-mono">{line.locationId}</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {poLineInfo ? poLineInfo.quantityOrdered : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{line.quantityReceived}
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-foreground">
                        {poLineInfo ? poLineInfo.quantityReceived : line.quantityReceived}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No line items in this Goods Receipt.</p>
        )}
      </div>
    </div>
  )
}
