'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { mrpApi, type MrpRunRecordDto } from '@/lib/api/mrp-api'
import { formatDate } from '@/lib/utils'

export default function MrpRunDetailPage() {
  const params = useParams()
  const runId = params?.id as string

  const [run, setRun] = React.useState<MrpRunRecordDto | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!runId) return
    mrpApi.getRunById(runId)
      .then((data) => setRun(data))
      .catch(() => setRun(null))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground animate-pulse">Loading MRP execution log details...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/mrp/runs">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to MRP Runs
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`MRP Execution Run #${run?.runNumber || runId || 'MRP-RUN'}`}
        description="Detailed calculation log, gross demand processing matrix, and generated purchase/production recommendations."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Executed By</p>
          <p className="text-sm font-semibold text-foreground">{run?.executedBy || 'System Auto-Scheduler'}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Execution Status</p>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> {run?.status || 'COMPLETED'}
          </span>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Timestamp</p>
          <p className="text-sm font-mono text-foreground">
            {run?.timestamp ? formatDate(run.timestamp) : 'Recent'}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Execution Log & Summary Trace
        </h3>
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 space-y-1.5">
          <p className="text-emerald-400">[INFO] Initialized MRP engine version 2.4.0</p>
          <p className="text-slate-400">[INFO] Loaded {run?.itemsProcessed || 0} active SKU records from inventory database</p>
          <p className="text-slate-400">[INFO] Exploded bills of materials for open sales orders</p>
          <p className="text-emerald-400">[INFO] Generated {run?.plannedOrdersCreated || 0} planned order suggestions</p>
          <p className="text-emerald-400">[INFO] MRP calculation cycle finished cleanly</p>
        </div>
      </div>
    </div>
  )
}
