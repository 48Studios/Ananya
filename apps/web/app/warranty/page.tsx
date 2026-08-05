'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileText, Plus, ShieldCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { warrantyClaimsApi, type WarrantyClaimDto } from '@/lib/api/warranty-claims-api'
import { formatDate } from '@/lib/utils'

export default function WarrantyPage() {
  const [claims, setClaims] = React.useState<WarrantyClaimDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    warrantyClaimsApi.getAll()
      .then((data) => setClaims(data || []))
      .catch(() => setClaims([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<WarrantyClaimDto>[] = [
    {
      accessorKey: 'claimNumber',
      header: 'Claim Number',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.claimNumber || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'serialNumber',
      header: 'Serial Number',
      cell: ({ row }) => <span className="font-mono text-xs text-foreground font-medium">{row.original.serialNumber || '-'}</span>,
    },
    {
      accessorKey: 'customerName',
      header: 'Customer & Product',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-xs text-foreground">{row.original.customerName || 'Customer'}</p>
          <p className="text-[11px] text-muted-foreground">{row.original.productName || '-'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Claim Status',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> {row.original.status || 'PENDING'}
        </span>
      ),
    },
    {
      accessorKey: 'createdDate',
      header: 'Date Filed',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.createdDate ? formatDate(row.original.createdDate) : '-'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warranty & Serial Number Guarantees"
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
          title="Pending Claims"
          value={claims.filter((c) => c?.status === 'PENDING').length}
          icon={Clock}
        />
        <StatCard
          title="Approved Claims"
          value={claims.filter((c) => c?.status === 'APPROVED').length}
          icon={ShieldCheck}
        />
      </div>

      <EntityDataTable
        data={claims}
        columns={columns}
        searchPlaceholder="Search claims by number, serial, customer, or product..."
        loading={loading}
        emptyTitle="No Warranty Claims"
        emptyMessage="No active warranty claims match your query."
        actionButton={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            File New Warranty Claim
          </Button>
        }
      />
    </div>
  )
}
