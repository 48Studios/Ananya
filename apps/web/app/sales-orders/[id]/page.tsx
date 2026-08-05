'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ShoppingBag, Truck, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency } from '@/lib/utils'

export default function SalesOrderDetailPage() {
  const params = useParams()
  const orderId = params?.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/sales-orders">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Sales Orders
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Sales Order #${orderId || 'SO-2026-0881'}`}
        description="Detailed line items, fulfillment status, and customer dispatch details."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Print Packing Slip
            </Button>
            <Button size="sm">
              <Truck className="w-4 h-4 mr-1.5" />
              Dispatch Shipment
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="text-sm font-semibold text-foreground">AeroTech Systems</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Fulfillment Status</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed & Allocated
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Total Order Value</p>
          <p className="text-sm font-bold font-mono text-foreground">{formatCurrency(48500)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-primary" />
          Order Line Items
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-3">SKU / Item</th>
                <th className="p-3">Description</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Unit Price</th>
                <th className="p-3">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground font-mono">
              <tr>
                <td className="p-3 font-bold text-primary">COMP-1001</td>
                <td className="p-3 font-sans">Precision CNC Spindle Motor 5kW</td>
                <td className="p-3">2 units</td>
                <td className="p-3">{formatCurrency(14250)}</td>
                <td className="p-3 font-bold">{formatCurrency(28500)}</td>
              </tr>
              <tr>
                <td className="p-3 font-bold text-primary">COMP-1004</td>
                <td className="p-3 font-sans">Optical Encoder Sensor Array</td>
                <td className="p-3">4 units</td>
                <td className="p-3">{formatCurrency(5000)}</td>
                <td className="p-3 font-bold">{formatCurrency(20000)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
