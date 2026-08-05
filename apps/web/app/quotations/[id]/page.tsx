'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency } from '@/lib/utils'

export default function QuotationDetailPage() {
  const params = useParams()
  const quoteId = params?.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/quotations">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Quotations
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Quotation #${quoteId || 'QUO-2026-901'}`}
        description="Detailed commercial proposal, unit pricing breakdown, and customer acceptance terms."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Send PDF to Client
            </Button>
            <Button size="sm">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Convert to Sales Order
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Prospect / Client</p>
          <p className="text-sm font-semibold text-foreground">AeroTech Systems</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Status</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Accepted
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Total Quoted Value</p>
          <p className="text-sm font-bold font-mono text-foreground">{formatCurrency(52000)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-primary" />
          Proposed Line Items & Pricing
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-3">Item / SKU</th>
                <th className="p-3">Specifications</th>
                <th className="p-3">Quoted Qty</th>
                <th className="p-3">Unit Price</th>
                <th className="p-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground font-mono">
              <tr>
                <td className="p-3 font-bold text-primary">COMP-1001</td>
                <td className="p-3 font-sans">Precision CNC Spindle Motor 5kW</td>
                <td className="p-3">2 units</td>
                <td className="p-3">{formatCurrency(16000)}</td>
                <td className="p-3 font-bold">{formatCurrency(32000)}</td>
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
