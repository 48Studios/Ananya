'use client'

import * as React from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Inbox, Upload, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ExportDialog } from '@/components/ui/export-dialog'
import { ImportWizard } from '@/components/ui/import-wizard'
import { BulkActionToolbar } from '@/components/ui/bulk-action-toolbar'

export interface FilterOption {
  label: string
  value: string
}

export interface FilterConfig {
  columnId?: string
  id?: string
  title?: string
  label?: string
  options: FilterOption[]
}

export interface EntityDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  filters?: FilterConfig[]
  filterConfigs?: FilterConfig[]
  loading?: boolean
  isLoading?: boolean
  emptyTitle?: string
  emptyMessage?: string
  actionButton?: React.ReactNode
  entityType?: string
  onRefreshData?: () => void
}

export function EntityDataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  filters,
  filterConfigs,
  loading = false,
  isLoading = false,
  emptyTitle = 'No data found',
  emptyMessage = 'No records match your criteria.',
  actionButton,
  entityType = 'Entity',
  onRefreshData,
}: EntityDataTableProps<TData, TValue>) {
  const activeFilters = filters || filterConfigs
  const activeLoading = loading || isLoading
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState({})
  const [isExportOpen, setIsExportOpen] = React.useState(false)
  const [isImportOpen, setIsImportOpen] = React.useState(false)

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
  })

  const selectedRows = table.getSelectedRowModel().rows
  const selectedIds = selectedRows.map((r) => String((r.original as Record<string, unknown>).id || r.id))
  const availableCols = columns.map((c) => (c as { accessorKey?: string; id?: string }).accessorKey || (c as { id?: string }).id || '').filter(Boolean)

  return (
    <div className="space-y-4">
      {/* Controls Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchKey ? (table.getColumn(searchKey)?.getFilterValue() as string) ?? '' : globalFilter}
              onChange={(e) => {
                const val = e.target.value
                if (searchKey) {
                  table.getColumn(searchKey)?.setFilterValue(val)
                } else {
                  setGlobalFilter(val)
                }
              }}
              placeholder={searchPlaceholder}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Select Filters */}
          {activeFilters?.map((filter) => {
            const colId = filter.columnId || filter.id || ''
            const column = colId ? table.getColumn(colId) : undefined
            if (!column) return null
            const filterValue = (column.getFilterValue() as string) ?? ''

            return (
              <Select
                key={colId}
                value={filterValue || 'ALL'}
                onValueChange={(val) => column.setFilterValue(val === 'ALL' ? undefined : val)}
              >
                <SelectTrigger className="w-40 h-9 text-xs">
                  <SelectValue placeholder={`All ${filter.title}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All {filter.title}</SelectItem>
                  {filter.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="text-xs">
            <Upload className="w-3.5 h-3.5 mr-1" />
            Import
          </Button>

          <Button variant="outline" size="sm" onClick={() => setIsExportOpen(true)} className="text-xs">
            <Download className="w-3.5 h-3.5 mr-1" />
            Export
          </Button>

          {actionButton && <div>{actionButton}</div>}
        </div>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        entityType={entityType}
        availableColumns={availableCols.length > 0 ? availableCols : ['id', 'name', 'code', 'status']}
        selectedIds={selectedIds}
        totalRecordsCount={table.getFilteredRowModel().rows.length}
      />

      {/* Import Wizard */}
      <ImportWizard
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        entityType={entityType}
        onImportComplete={() => {
          if (onRefreshData) onRefreshData()
        }}
      />

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        entityType={entityType}
        selectedIds={selectedIds}
        onClearSelection={() => setRowSelection({})}
        onActionComplete={() => {
          if (onRefreshData) onRefreshData()
        }}
      />

      {/* Table Container */}
      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border bg-muted/40">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider select-none"
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={cn(
                              'flex items-center gap-1.5',
                              canSort && 'cursor-pointer hover:text-foreground transition-colors',
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {canSort && (
                              <ArrowUpDown className="w-3 h-3 text-muted-foreground/70" />
                            )}
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {activeLoading ? (
                // Skeleton Rows
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    {columns.map((_, cIdx) => (
                      <td key={`skeleton-cell-${cIdx}`} className="px-4 py-3.5">
                        <div className="h-4 bg-muted/60 rounded-md w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 text-foreground">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                // Empty State
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Inbox className="w-8 h-8 text-muted-foreground/60" />
                      <div className="space-y-1">
                        <p className="text-base font-medium text-foreground">{emptyTitle}</p>
                        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                      </div>
                      {actionButton && <div className="pt-1">{actionButton}</div>}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && table.getRowModel().rows.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <div>
              Showing{' '}
              <span className="font-medium text-foreground">
                {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-foreground">
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                )}
              </span>{' '}
              of{' '}
              <span className="font-medium text-foreground">
                {table.getFilteredRowModel().rows.length}
              </span>{' '}
              entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs font-medium px-2">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
