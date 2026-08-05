'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export default function TaskDetailPage() {
  const params = useParams()
  const taskId = params?.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/tasks">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Tasks
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Task #${taskId || 'tsk-1'}`}
        description="Inspect operational task details, assignment, and completion checklist."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Mark Task Complete
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Task Title</p>
          <p className="text-sm font-semibold text-foreground">Inspect incoming shipment PO-2026-042</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Assignee</p>
          <p className="text-sm font-semibold text-foreground">Warehouse Lead</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Module Context</p>
          <span className="font-mono text-xs text-primary font-bold">PROCUREMENT</span>
        </div>
      </div>
    </div>
  )
}
