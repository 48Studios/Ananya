'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Landmark, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function AccountDetailPage() {
  const params = useParams()
  const accId = params?.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounts">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Chart of Accounts
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Ledger Account #${accId || '1010-CASH'}`}
        description="General ledger journal activity, debits, credits, and running balance history."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Account Name</p>
          <p className="text-sm font-semibold text-foreground">Main Operating Checking Account</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Account Category</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> ASSET
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Current Balance</p>
          <p className="text-sm font-bold font-mono text-foreground">{formatCurrency(345000)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          Recent General Ledger Entries
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="p-3">Journal Ref</th>
                <th className="p-3">Description</th>
                <th className="p-3">Debit (DR)</th>
                <th className="p-3">Credit (CR)</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground font-mono">
              <tr>
                <td className="p-3 font-bold text-primary">JV-2026-091</td>
                <td className="p-3 font-sans">Customer Payment Receipt - AeroTech Systems</td>
                <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(48500)}</td>
                <td className="p-3 text-muted-foreground">-</td>
                <td className="p-3 font-sans text-muted-foreground">{formatDate('2026-02-04')}</td>
              </tr>
              <tr>
                <td className="p-3 font-bold text-primary">JV-2026-092</td>
                <td className="p-3 font-sans">Supplier PO Settlement - Precision Alloys</td>
                <td className="p-3 text-muted-foreground">-</td>
                <td className="p-3 font-bold text-amber-600 dark:text-amber-400">-{formatCurrency(12900)}</td>
                <td className="p-3 font-sans text-muted-foreground">{formatDate('2026-02-02')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
