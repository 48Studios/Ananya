'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Warehouse as WarehouseIcon, Plus, CheckCircle2, MapPin, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

export default function WarehousePage() {
  const [locations, setLocations] = React.useState<LocationDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    locationsApi.getAll()
      .then((data: LocationDto[]) => setLocations(data))
      .catch(() => setLocations([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<LocationDto>[] = [
    {
      accessorKey: 'code',
      header: 'Warehouse / Location Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Location Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'kind',
      header: 'Storage Type',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.kind || 'Warehouse Location'}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Facility Name',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          {row.original.name}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Operations Control Center"
        description="Manage multi-facility storage locations, aisle/rack/bin allocations, and stock movement policies."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Warehouse Location
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Warehouse Locations"
          value={locations.length}
          icon={WarehouseIcon}
        />
        <StatCard
          title="Storage Bins Configured"
          value="48 Bins"
          icon={Boxes}
        />
        <StatCard
          title="Facility Occupancy"
          value="64% Capacity"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={locations}
        columns={columns}
        searchPlaceholder="Search warehouses by code, name, or location..."
        loading={loading}
      />
    </div>
  )
}
