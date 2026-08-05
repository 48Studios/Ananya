'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export default function ServiceTicketDetailPage() {
  const params = useParams()
  const ticketId = params?.id as string

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/service">
          <Button variant="ghost" size="xs">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Service Tickets
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Field Service Ticket #${ticketId || 'SRV-2026-081'}`}
        description="Field diagnostic details, technician assignment, and resolution log."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Resolve & Close Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="text-sm font-semibold text-foreground">AeroTech Systems</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Asset Serial</p>
          <p className="text-sm font-mono text-foreground">SN-772910-A (Spindle Motor)</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Assigned Technician</p>
          <p className="text-sm font-semibold text-foreground">Field Tech Alex R.</p>
        </div>
      </div>
    </div>
  )
}
