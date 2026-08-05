'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Scale, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'

interface UnitOfMeasure {
  id: string
  code: string
  name: string
  category: 'COUNT' | 'WEIGHT' | 'LENGTH' | 'VOLUME'
  isBaseUnit: boolean
}

const mockUnits: UnitOfMeasure[] = [
  { id: 'u-1', code: 'PCS', name: 'Pieces', category: 'COUNT', isBaseUnit: true },
  { id: 'u-2', code: 'KG', name: 'Kilograms', category: 'WEIGHT', isBaseUnit: true },
  { id: 'u-3', code: 'G', name: 'Grams', category: 'WEIGHT', isBaseUnit: false },
  { id: 'u-4', code: 'M', name: 'Meters', category: 'LENGTH', isBaseUnit: true },
  { id: 'u-5', code: 'MM', name: 'Millimeters', category: 'LENGTH', isBaseUnit: false },
  { id: 'u-6', code: 'L', name: 'Liters', category: 'VOLUME', isBaseUnit: true },
]

export default function UnitsPage() {
  const [units] = React.useState<UnitOfMeasure[]>(mockUnits)

  const columns: ColumnDef<UnitOfMeasure>[] = [
    {
      accessorKey: 'code',
      header: 'UOM Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Unit Name',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Measurement Category',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.category}
        </span>
      ),
    },
    {
      accessorKey: 'isBaseUnit',
      header: 'Base Unit',
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {row.original.isBaseUnit ? 'Primary Base Unit' : 'Derived Secondary'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units of Measure (UOM)"
        description="Configure unit conversion factors, inventory measurement standards, and baseline packaging units."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Unit of Measure
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Configured Units"
          value={units.length}
          icon={<Scale className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Categories"
          value="4 Types"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Base System Standard"
          value="SI & Imperial"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={units}
        columns={columns}
        searchPlaceholder="Search units by code, name, or category..."
      />
    </div>
  )
}
