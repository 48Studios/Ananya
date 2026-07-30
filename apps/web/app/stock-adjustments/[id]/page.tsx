'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Printer,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import {
  stockAdjustmentsApi,
  type StockAdjustmentDto,
  type StockAdjustmentStatus,
} from '@/lib/api/stock-adjustments-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

function getStatusBadge(status: StockAdjustmentStatus) {
  switch (status) {
    case 'APPROVED':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          APPROVED
        </span>
      )
    case 'PENDING':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          PENDING APPROVAL
        </span>
      )
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          CANCELLED
        </span>
      )
  }
}

export default function ViewStockAdjustmentPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [adj, setAdj] = React.useState<StockAdjustmentDto | null>(null)
  const [location, setLocation] = React.useState<LocationDto | null>(null)
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isApproving, setIsApproving] = React.useState(false)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [showApproveDialog, setShowApproveDialog] = React.useState(false)
  const [showCancelDialog, setShowCancelDialog] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const adjData = await stockAdjustmentsApi.getById(id)
      setAdj(adjData)

      const [locData, comps] = await Promise.all([
        locationsApi.getById(adjData.locationId).catch(() => null),
        componentsApi.getAll().catch(() => []),
      ])

      if (locData) setLocation(locData)

      const compMap: Record<string, ComponentDto> = {}
      for (const c of comps) compMap[c.id] = c
      setComponentsMap(compMap)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load Stock Adjustment details')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleApprove = async () => {
    if (!adj) return
    setIsApproving(true)
    try {
      const updated = await stockAdjustmentsApi.approve(adj.id, 'ADMIN')
      setAdj(updated)
      setShowApproveDialog(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve adjustment')
    } finally {
      setIsApproving(false)
    }
  }

  const handleCancel = async () => {
    if (!adj) return
    setIsCancelling(true)
    try {
      const updated = await stockAdjustmentsApi.cancel(adj.id)
      setAdj(updated)
      setShowCancelDialog(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel adjustment')
    } finally {
      setIsCancelling(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading Stock Adjustment details..." />
  }

  if (error || !adj) {
    return (
      <ErrorState
        title="Stock Adjustment Not Found"
        message={error || 'The requested Stock Adjustment record does not exist.'}
        onRetry={fetchData}
      />
    )
  }

  const totalIncreased = adj.lines.reduce(
    (acc, l) => (l.difference > 0 ? acc + l.difference : acc),
    0,
  )
  const totalDecreased = adj.lines.reduce(
    (acc, l) => (l.difference < 0 ? acc + Math.abs(l.difference) : acc),
    0,
  )

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={adj.adjustmentNumber}
        description={`Target Location: ${location?.name || adj.locationId}`}
        breadcrumbs={[
          { label: 'Stock Adjustments', href: '/stock-adjustments' },
          { label: adj.adjustmentNumber },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => router.push('/stock-adjustments')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>
            {adj.status === 'PENDING' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowCancelDialog(true)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setShowApproveDialog(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Approve & Post Stock
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Line Items Reconciled"
          value={adj.lines.length}
          subtitle="Reconciliation lines"
          icon={CheckCircle2}
        />
        <StatCard
          title="Total Stock Increased"
          value={`+${totalIncreased} units`}
          subtitle="Positive variances"
          icon={ArrowDownLeft}
        />
        <StatCard
          title="Total Stock Decreased"
          value={`-${totalDecreased} units`}
          subtitle="Negative variances"
          icon={ArrowUpRight}
        />
        <StatCard
          title="Location"
          value={location?.code || adj.locationId.slice(0, 8)}
          subtitle={location?.name || 'Target Warehouse'}
          icon={MapPin}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata Info */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Adjustment Metadata</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit record for physical inventory reconciliation.
              </p>
            </div>
            {getStatusBadge(adj.status)}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Adjustment #</dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {adj.adjustmentNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Reason</dt>
              <dd className="mt-1 font-medium text-foreground">{adj.reason}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Location</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {location ? (
                  <Link href={`/locations/${location.id}`} className="hover:underline flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {location.name} <span className="font-mono text-xs text-muted-foreground">({location.code})</span>
                  </Link>
                ) : (
                  adj.locationId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Created By</dt>
              <dd className="mt-1 text-sm text-foreground">{adj.createdBy}</dd>
            </div>

            {adj.approvedBy && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Approved By</dt>
                <dd className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {adj.approvedBy} on {adj.approvedAt ? new Date(adj.approvedAt).toLocaleString() : '—'}
                </dd>
              </div>
            )}
          </dl>

          {adj.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Notes</span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {adj.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(adj.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(adj.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Ledger Impact Status Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">Inventory Integration</h3>
          <div className="space-y-3 text-xs">
            {adj.status === 'APPROVED' ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-400 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Posted to Stock Ledger
                </div>
                <p className="text-[11px] opacity-90">
                  `Adjustment` inventory transactions recorded. Stock projections updated at location.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Clock className="w-4 h-4" /> Pending Approval
                </div>
                <p className="text-[11px] opacity-90">
                  Inventory balances will update only after approval.
                </p>
              </div>
            )}

            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Added:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{totalIncreased}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Removed:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">-{totalDecreased}</span>
              </div>
            </div>

            <Link href="/transactions" className="inline-block text-xs text-primary hover:underline font-medium">
              View Inventory Transactions Audit Log →
            </Link>
          </div>
        </div>
      </div>

      {/* Reconciliation Lines Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Reconciliation Items ({adj.lines.length})
        </h3>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component</th>
                <th className="p-3 text-right">System Stock</th>
                <th className="p-3 text-right">Counted Stock</th>
                <th className="p-3 text-right">Calculated Difference</th>
                <th className="p-3">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adj.lines.map((line, idx) => {
                const comp = componentsMap[line.componentId]
                return (
                  <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground font-mono">{idx + 1}</td>
                    <td className="p-3 font-medium">
                      {comp ? (
                        <Link href={`/components/${comp.id}`} className="text-foreground hover:underline">
                          {comp.name} <span className="font-mono text-muted-foreground text-[11px]">({comp.sku})</span>
                        </Link>
                      ) : (
                        <span className="font-mono">{line.componentId}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {line.currentQuantity} {line.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.countedQuantity} {line.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      {line.difference > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">+{line.difference}</span>
                      )}
                      {line.difference < 0 && (
                        <span className="text-rose-600 dark:text-rose-400">{line.difference}</span>
                      )}
                      {line.difference === 0 && <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="p-3">
                      {line.difference > 0 && (
                        <span className="inline-flex items-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Stock Increase
                        </span>
                      )}
                      {line.difference < 0 && (
                        <span className="inline-flex items-center text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          Stock Decrease
                        </span>
                      )}
                      {line.difference === 0 && (
                        <span className="text-[11px] text-muted-foreground">No Variance</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        title="Approve Stock Adjustment"
        description={`Are you sure you want to approve Stock Adjustment "${adj.adjustmentNumber}"? This will create immutable ledger transactions and update stock balances at location "${location?.name}". This action cannot be undone.`}
        confirmText="Approve & Post Stock"
        loading={isApproving}
        variant="default"
        onConfirm={handleApprove}
        onCancel={() => setShowApproveDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Stock Adjustment"
        description={`Are you sure you want to cancel Stock Adjustment "${adj.adjustmentNumber}"?`}
        confirmText="Confirm Cancellation"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  )
}
