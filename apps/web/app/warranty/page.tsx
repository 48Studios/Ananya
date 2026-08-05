'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldCheck, Plus, CheckCircle2, Clock, XCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable, type FilterConfig } from '@/components/ui/entity-data-table'
import { formatDate } from '@/lib/utils'

interface WarrantyClaim {
  id: string
  claimNumber: string
  serialNumber: string
  customerName: string
  productName: string
  issueDescription: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'IN_REVIEW'
  submittedDate: string
  resolvedDate?: string
}

const mockClaims: WarrantyClaim[] = [
  {
    id: 'w-1',
    claimNumber: 'WAR-2026-001',
    serialNumber: 'SN-772910',
    customerName: 'Acme Dynamics Corp',
    productName: 'Precision CNC Spindle Motor 5kW',
    issueDescription: 'Bearing overheating after 120 hrs operation',
    status: 'APPROVED',
    submittedDate: '2026-02-01',
    resolvedDate: '2026-02-03',
  },
  {
    id: 'w-2',
    claimNumber: 'WAR-2026-002',
    serialNumber: 'SN-881023',
    customerName: 'Starlight Robotics',
    productName: 'Optical Encoder Sensor Array',
    issueDescription: 'Signal calibration drift on axis 2',
    status: 'IN_REVIEW',
    submittedDate: '2026-02-04',
  },
  {
    id: 'w-3',
    claimNumber: 'WAR-2026-003',
    serialNumber: 'SN-991204',
    customerName: 'Apex Heavy Industries',
    productName: 'Hydraulic Actuator Pump 3000PSI',
    issueDescription: 'Seal ring leakage detected under max pressure test',
    status: 'PENDING',
    submittedDate: '2026-02-05',
  },
]

export default function WarrantyPage() {
  const [claims] = React.useState<WarrantyClaim[]>(mockClaims)

  const activeClaimsCount = claims.filter((c) => c.status === 'PENDING' || c.status === 'IN_REVIEW').length
  const approvedClaimsCount = claims.filter((c) => c.status === 'APPROVED').length

  const filterConfigs: FilterConfig[] = [
    {
      id: 'status',
      label: 'Claim Status',
      options: [
        { label: 'Pending', value: 'PENDING' },
        { label: 'In Review', value: 'IN_REVIEW' },
        { label: 'Approved', value: 'APPROVED' },
        { label: 'Rejected', value: 'REJECTED' },
      ],
    },
  ]

  const columns: ColumnDef<WarrantyClaim>[] = [
    {
      accessorKey: 'claimNumber',
      header: 'Claim No.',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.claimNumber}
        </span>
      ),
    },
    {
      accessorKey: 'serialNumber',
      header: 'Serial No.',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.serialNumber}</span>,
    },
    {
      accessorKey: 'productName',
      header: 'Product / Asset',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.productName}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.customerName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'issueDescription',
      header: 'Reported Issue',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-xs truncate block">
          {row.original.issueDescription}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        if (s === 'APPROVED') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
            </span>
          )
        }
        if (s === 'IN_REVIEW' || s === 'PENDING') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Clock className="w-3 h-3 mr-1" /> {s === 'IN_REVIEW' ? 'In Review' : 'Pending'}
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </span>
        )
      },
    },
    {
      accessorKey: 'submittedDate',
      header: 'Submitted',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.submittedDate)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warranty & RMA Claims"
        description="Track product warranty claims, serial number guarantees, and customer return authorizations."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            File New Warranty Claim
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Claims Filed"
          value={claims.length}
          icon={FileText}
        />
        <StatCard
          title="Active Pending Claims"
          value={activeClaimsCount}
          icon={Clock}
        />
        <StatCard
          title="Approved Claims"
          value={approvedClaimsCount}
          icon={ShieldCheck}
        />
      </div>

      <EntityDataTable
        data={claims}
        columns={columns}
        searchPlaceholder="Search claims by number, serial, customer, or product..."
        filters={filterConfigs}
      />
    </div>
  )
}
