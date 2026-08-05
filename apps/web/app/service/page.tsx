'use client'

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { Wrench, Plus, CheckCircle2, Clock, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface ServiceTicket {
  id: string
  ticketNumber: string
  customerName: string
  assetName: string
  issueSubject: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  createdDate: string
}

const mockTickets: ServiceTicket[] = [
  { id: 'srv-1', ticketNumber: 'SRV-2026-081', customerName: 'AeroTech Systems', assetName: 'CNC Spindle Motor #2', issueSubject: 'On-site vibration diagnostic check', priority: 'HIGH', status: 'IN_PROGRESS', createdDate: '2026-02-04' },
  { id: 'srv-2', ticketNumber: 'SRV-2026-082', customerName: 'Starlight Robotics', assetName: 'Optical Encoder #4', issueSubject: 'Firmware calibration update', priority: 'MEDIUM', status: 'OPEN', createdDate: '2026-02-05' },
]

export default function ServicePage() {
  const [tickets] = React.useState<ServiceTicket[]>(mockTickets)

  const filterConfigs: FilterConfig[] = [
    {
      id: 'priority',
      label: 'Priority',
      options: [
        { label: 'High', value: 'HIGH' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'Low', value: 'LOW' },
      ],
    },
  ]

  const columns: ColumnDef<ServiceTicket>[] = [
    {
      accessorKey: 'ticketNumber',
      header: 'Ticket No.',
      cell: ({ row }) => (
        <Link href={`/service/${row.original.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
          {row.original.ticketNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customerName',
      header: 'Customer & Asset',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.customerName}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.assetName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'issueSubject',
      header: 'Service Request',
      cell: ({ row }) => <span className="text-xs text-muted-foreground max-w-xs truncate block">{row.original.issueSubject}</span>,
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
          {row.original.priority}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'createdDate',
      header: 'Reported',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdDate)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link href={`/service/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Ticket
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Service & Technical Support Tickets"
        description="Manage customer field service requests, engineer dispatches, asset repairs, and SLA resolution times."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Service Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Open Service Tickets"
          value={tickets.length}
          icon={<Wrench className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Dispatched Engineers"
          value="2 Techs On-Site"
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          title="SLA Compliance"
          value="99.4% On Time"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={tickets}
        columns={columns}
        searchPlaceholder="Search service tickets by number, customer, or asset..."
        filterConfigs={filterConfigs}
      />
    </div>
  )
}
