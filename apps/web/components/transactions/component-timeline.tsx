'use client'

import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  RotateCcw,
  Package,
  Wrench,
  Clock,
  User,
} from 'lucide-react'
import type { InventoryTransactionDto, TransactionType } from '@/lib/api/inventory-transactions-api'

interface ComponentTimelineProps {
  transactions: InventoryTransactionDto[]
  componentName?: string
  componentSku?: string
}

function getTransactionIcon(type: TransactionType) {
  switch (type) {
    case 'Receipt':
    case 'InitialStock':
      return <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
    case 'Issue':
    case 'Consumption':
      return <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
    case 'Transfer':
      return <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    case 'Adjustment':
    case 'ManualCorrection':
      return <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
    case 'Return':
      return <RotateCcw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
    case 'Production':
      return <Package className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

function getDirectionBadge(type: TransactionType, quantity: number) {
  if (['Receipt', 'InitialStock', 'Production', 'Return'].includes(type)) {
    return (
      <span className="inline-flex items-center text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
        +{quantity}
      </span>
    )
  }
  if (['Issue', 'Consumption'].includes(type)) {
    return (
      <span className="inline-flex items-center text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
        -{quantity}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
      ±{quantity}
    </span>
  )
}

export function ComponentTimeline({
  transactions,
  componentName,
  componentSku,
}: ComponentTimelineProps) {
  if (transactions.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground italic border border-border rounded-xl">
        No stock transaction history recorded for {componentName || 'this component'}.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-sm font-semibold text-foreground">
          Stock Movement Timeline {componentSku && <span className="font-mono text-muted-foreground">({componentSku})</span>}
        </h3>
        <span className="text-xs font-mono text-muted-foreground">
          {transactions.length} audit entries
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
        {transactions.map((tx) => (
          <div key={tx.id} className="relative group">
            {/* Timeline Icon Node */}
            <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center shadow-xs">
              {getTransactionIcon(tx.transactionType)}
            </div>

            {/* Event Content Box */}
            <div className="bg-card border border-border rounded-lg p-3 space-y-1.5 shadow-xs group-hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {tx.transactionType}
                  </span>
                  {getDirectionBadge(tx.transactionType, tx.quantity)}
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {tx.unitOfMeasure}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(tx.createdAt).toLocaleString()}
                </span>
              </div>

              {tx.reason && (
                <p className="text-xs text-muted-foreground">{tx.reason}</p>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                <span className="font-mono">
                  Ref: {tx.reference || '—'}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {tx.createdBy}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
