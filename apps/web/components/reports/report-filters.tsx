'use client'

import * as React from 'react'
import { Filter, Calendar, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface FilterState {
  startDate?: string
  endDate?: string
  locationId?: string
  componentId?: string
  supplierId?: string
  categoryId?: string
  status?: string
  search?: string
}

export interface ReportFiltersProps {
  filters: FilterState
  onChange: (newFilters: FilterState) => void
  showStatusFilter?: boolean
  statusOptions?: { label: string; value: string }[]
}

export function ReportFilters({
  filters,
  onChange,
  showStatusFilter = false,
  statusOptions = [],
}: ReportFiltersProps) {
  const handleReset = () => {
    onChange({
      startDate: '',
      endDate: '',
      locationId: '',
      componentId: '',
      supplierId: '',
      categoryId: '',
      status: '',
      search: '',
    })
  }

  const inputClass =
    'px-3 py-1.5 text-xs bg-input/40 border border-border rounded-md outline-none focus:border-primary text-foreground transition-colors'

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Report Filters</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset Filters
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Start Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Start Date
          </label>
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
            className={inputClass + ' w-full'}
          />
        </div>

        {/* End Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> End Date
          </label>
          <input
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
            className={inputClass + ' w-full'}
          />
        </div>

        {/* Status Filter */}
        {showStatusFilter && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Status
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => onChange({ ...filters, status: e.target.value })}
              className={inputClass + ' w-full'}
            >
              <option value="">All Statuses</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Search Term
          </label>
          <input
            type="text"
            placeholder="Search code, name, ref..."
            value={filters.search || ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className={inputClass + ' w-full'}
          />
        </div>
      </div>
    </div>
  )
}
