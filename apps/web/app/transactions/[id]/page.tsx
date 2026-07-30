'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Printer,
  Package,
  MapPin,
  User,
  Clock,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
  type TransactionType,
} from '@/lib/api/inventory-transactions-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

function getDirectionBadge(type: TransactionType) {
  if (['Receipt', 'InitialStock', 'Production', 'Return'].includes(type)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        <ArrowDownLeft className="w-3 h-3 mr-1" />
        INBOUND (+)
      </span>
    )
  }
  if (['Issue', 'Consumption'].includes(type)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
        <ArrowUpRight className="w-3 h-3 mr-1" />
        OUTBOUND (-)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
      <ArrowRightLeft className="w-3 h-3 mr-1" />
      INTERNAL TRANSFER (±)
    </span>
  )
}

export default function ViewTransactionPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [tx, setTx] = React.useState<InventoryTransactionDto | null>(null)
  const [component, setComponent] = React.useState<ComponentDto | null>(null)
  const [sourceLocation, setSourceLocation] = React.useState<LocationDto | null>(null)
  const [destLocation, setDestLocation] = React.useState<LocationDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchData = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const txData = await inventoryTransactionsApi.getById(id)
      setTx(txData)

      const [compData, locs] = await Promise.all([
        componentsApi.getById(txData.componentId).catch(() => null),
        locationsApi.getAll().catch(() => []),
      ])

      if (compData) setComponent(compData)

      const locMap: Record<string, LocationDto> = {}
      for (const l of locs) locMap[l.id] = l

      if (txData.sourceLocationId && locMap[txData.sourceLocationId]) {
        setSourceLocation(locMap[txData.sourceLocationId] || null)
      }
      if (txData.destinationLocationId && locMap[txData.destinationLocationId]) {
        setDestLocation(locMap[txData.destinationLocationId] || null)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load transaction details')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <LoadingState message="Loading inventory transaction audit entry..." />
  }

  if (error || !tx) {
    return (
      <ErrorState
        title="Transaction Not Found"
        message={error || 'The requested inventory transaction record does not exist.'}
        onRetry={fetchData}
      />
    )
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={`Transaction ${tx.id.slice(0, 8)}`}
        description={`Immutable stock movement audit entry — Recorded ${new Date(tx.createdAt).toLocaleString()}`}
        breadcrumbs={[
          { label: 'Inventory Transactions', href: '/transactions' },
          { label: tx.id.slice(0, 8) },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => router.push('/transactions')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Audit Record
            </Button>
          </div>
        }
      />

      {/* KPI Stat Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Quantity Moved"
          value={`${tx.quantity} ${tx.unitOfMeasure}`}
          subtitle="Audit ledger quantity"
          icon={Package}
        />
        <StatCard
          title="Transaction Type"
          value={tx.transactionType}
          subtitle="Business event classification"
          icon={FileText}
        />
        <StatCard
          title="Performed By"
          value={tx.createdBy}
          subtitle="User / System origin"
          icon={User}
        />
        <StatCard
          title="Timestamp"
          value={new Date(tx.createdAt).toLocaleDateString()}
          subtitle="Ledger entry time"
          icon={Clock}
        />
      </div>

      {/* Detail Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Audit Info Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Transaction Metadata</h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                UUID: {tx.id}
              </p>
            </div>
            {getDirectionBadge(tx.transactionType)}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Transaction Type</dt>
              <dd className="mt-1 font-semibold text-foreground">{tx.transactionType}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Reference Document</dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
                {tx.reference || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Affected Component</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {component ? (
                  <Link href={`/components/${component.id}`} className="hover:underline">
                    {component.name} <span className="font-mono text-xs text-muted-foreground">({component.sku})</span>
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{tx.componentId}</span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Unit of Measure</dt>
              <dd className="mt-1 text-sm text-foreground font-mono">{tx.unitOfMeasure}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Source Location</dt>
              <dd className="mt-1 text-sm text-foreground">
                {sourceLocation ? (
                  <span className="flex items-center gap-1 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {sourceLocation.name} <span className="font-mono text-xs text-muted-foreground">({sourceLocation.code})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">None (External Origin)</span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">Destination Location</dt>
              <dd className="mt-1 text-sm text-foreground">
                {destLocation ? (
                  <span className="flex items-center gap-1 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {destLocation.name} <span className="font-mono text-xs text-muted-foreground">({destLocation.code})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">None (External Target)</span>
                )}
              </dd>
            </div>
          </dl>

          {tx.reason && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Reason / Notes</span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {tx.reason}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Recorded: {new Date(tx.createdAt).toLocaleString()}</span>
            <span>Recorded By: {tx.createdBy}</span>
          </div>
        </div>

        {/* Audit Compliance Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">Audit Compliance</h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1 text-muted-foreground">
              <div className="font-medium text-foreground">Immutable Audit Record</div>
              <p className="text-[11px]">
                Inventory transactions represent historical facts in the system ledger. They cannot be edited or deleted under any circumstances.
              </p>
            </div>

            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ledger ID:</span>
                <span className="text-foreground">{tx.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Type:</span>
                <span className="font-bold text-foreground">{tx.transactionType}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
