"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Upload,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  clampPageIndex,
  dataTableQuerySignature,
  pageIndexForResizedPage,
} from "@/lib/data-table-pagination";
import { ExportDialog } from "@/components/ui/export-dialog";
import { ImportWizard } from "@/components/ui/import-wizard";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";

export interface ColumnMetaConfig {
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    width?: string | number;
    minWidth?: string | number;
    maxWidth?: string | number;
    className?: string;
    headerClassName?: string;
    cellClassName?: string;
  }
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  columnId?: string;
  id?: string;
  title?: string;
  label?: string;
  options: FilterOption[];
}

export interface EntityDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  filterConfigs?: FilterConfig[];
  loading?: boolean;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  actionButton?: React.ReactNode;
  entityType?: string;
  onRefreshData?: () => void;
  tableClassName?: string;
  minWidth?: string | number;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  /**
   * Page-level status area (success/error notices). It is rendered inside the
   * sticky toolbar, so a notice is always visible next to the search controls
   * without scrolling the reviewer away from the row they acted on.
   */
  notice?: React.ReactNode;
  /**
   * Value that changes whenever page-level filters change the `data` prop.
   * Changing it sends the reviewer back to the first page, matching the
   * reset that search/filter/sort changes perform internally.
   */
  resetPageKey?: string | number | boolean;
}

export function EntityDataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
  filters,
  filterConfigs,
  loading = false,
  isLoading = false,
  emptyTitle = "No data found",
  emptyMessage = "No records match your criteria.",
  actionButton,
  entityType,
  onRefreshData,
  tableClassName,
  minWidth,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  notice,
  resetPageKey,
}: EntityDataTableProps<TData, TValue>) {
  const activeFilters = filters || filterConfigs;
  const activeLoading = loading || isLoading;
  const canImportExport = Boolean(entityType && entityType.trim().length > 0);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState({});
  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  const table = useReactTable({
    data,
    columns,
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
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
    // Add / edit / delete replace the `data` array, and TanStack resets the
    // page index on every data change by default. Reviewers must stay on the
    // page they were working on, so the reset is disabled and the page index is
    // corrected only by the two effects below.
    autoResetPageIndex: false,
  });

  const querySignature = dataTableQuerySignature({
    globalFilter,
    columnFilters,
    sorting,
    resetPageKey,
  });
  const previousQuerySignature = React.useRef(querySignature);

  // A new search / filter / sort query is a new result set: start it from the
  // first page. Data mutations keep the reviewer on the current page instead.
  React.useEffect(() => {
    if (previousQuerySignature.current === querySignature) return;
    previousQuerySignature.current = querySignature;
    table.setPageIndex(0);
  }, [querySignature, table]);

  // Deleting the last row of the last page must land on the last page that
  // still has rows instead of an empty one.
  const pageCount = table.getPageCount();
  const currentPageIndex = table.getState().pagination.pageIndex;
  React.useEffect(() => {
    const nextPageIndex = clampPageIndex(currentPageIndex, pageCount);
    if (nextPageIndex !== currentPageIndex) {
      table.setPageIndex(nextPageIndex);
    }
  }, [pageCount, currentPageIndex, table]);

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = selectedRows.map((r) =>
    String((r.original as Record<string, unknown>).id || r.id),
  );
  const availableCols = columns
    .map(
      (c) =>
        (c as { accessorKey?: string; id?: string }).accessorKey ||
        (c as { id?: string }).id ||
        "",
    )
    .filter(Boolean);

  const hasCustomSizing = React.useMemo(() => {
    return columns.some((col) => {
      const meta = (col as { meta?: ColumnMetaConfig }).meta;
      return Boolean(
        meta?.width || meta?.minWidth || (col.size && col.size !== 150),
      );
    });
  }, [columns]);

  return (
    <div className="space-y-4">
      {/* Sticky toolbar: the status area and the search controls own the scroll
          position, so a success/failure notice is always visible alongside the
          search box and never scrolls the reviewer back through the page. */}
      <div className="sticky top-0 z-20 space-y-3 border-b border-border bg-background pt-2 pb-3">
        {notice && <div className="space-y-3">{notice}</div>}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={
                  searchKey
                    ? ((table
                        .getColumn(searchKey)
                        ?.getFilterValue() as string) ?? "")
                    : globalFilter
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (searchKey) {
                    table.getColumn(searchKey)?.setFilterValue(val);
                  } else {
                    setGlobalFilter(val);
                  }
                }}
                placeholder={searchPlaceholder}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Select Filters */}
            {activeFilters?.map((filter) => {
              const colId = filter.columnId || filter.id || "";
              const column = colId ? table.getColumn(colId) : undefined;
              if (!column) return null;
              const filterValue = (column.getFilterValue() as string) ?? "";

              return (
                <Select
                  key={colId}
                  value={filterValue || "ALL"}
                  onValueChange={(val) =>
                    column.setFilterValue(val === "ALL" ? undefined : val)
                  }
                >
                  <SelectTrigger className="w-40 !h-9 text-xs">
                    <SelectValue placeholder={`All ${filter.title}`} />
                  </SelectTrigger>
                  <SelectContent className="p-1.5">
                    <SelectItem value="ALL" className="text-xs">
                      All {filter.title}
                    </SelectItem>
                    {filter.options.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-xs"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {canImportExport && (
              <>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setIsImportOpen(true)}
                  className="text-xs"
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  Import
                </Button>

                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setIsExportOpen(true)}
                  className="text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Export
                </Button>
              </>
            )}

            {actionButton && <div>{actionButton}</div>}
          </div>
        </div>
      </div>

      {/* Export Dialog */}
      {canImportExport && entityType && (
        <>
          <ExportDialog
            isOpen={isExportOpen}
            onClose={() => setIsExportOpen(false)}
            entityType={entityType}
            availableColumns={
              availableCols.length > 0
                ? availableCols
                : ["id", "name", "code", "status"]
            }
            selectedIds={selectedIds}
            totalRecordsCount={table.getFilteredRowModel().rows.length}
          />

          <ImportWizard
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            entityType={entityType}
            onImportComplete={() => {
              if (onRefreshData) onRefreshData();
            }}
          />

          <BulkActionToolbar
            entityType={entityType}
            selectedIds={selectedIds}
            onClearSelection={() => setRowSelection({})}
            onActionComplete={() => {
              if (onRefreshData) onRefreshData();
            }}
          />
        </>
      )}

      {/* Table Container */}
      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table
            className={cn(
              "w-full text-sm text-left border-collapse",
              hasCustomSizing && "table-fixed",
              tableClassName,
            )}
            style={{
              minWidth: minWidth
                ? typeof minWidth === "number"
                  ? `${minWidth}px`
                  : minWidth
                : undefined,
            }}
          >
            {hasCustomSizing && (
              <colgroup>
                {table.getVisibleLeafColumns().map((col) => {
                  const colMeta = col.columnDef.meta as
                    ColumnMetaConfig | undefined;
                  const colWidth =
                    colMeta?.width ??
                    (col.columnDef.size !== 150
                      ? col.columnDef.size
                      : undefined);
                  const colMinWidth = colMeta?.minWidth;
                  return (
                    <col
                      key={col.id}
                      style={{
                        width:
                          colWidth !== undefined
                            ? typeof colWidth === "number"
                              ? `${colWidth}px`
                              : colWidth
                            : undefined,
                        minWidth:
                          colMinWidth !== undefined
                            ? typeof colMinWidth === "number"
                              ? `${colMinWidth}px`
                              : colMinWidth
                            : undefined,
                      }}
                    />
                  );
                })}
              </colgroup>
            )}
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border bg-muted/40"
                >
                  {headerGroup.headers.map((header, hIdx) => {
                    const canSort = header.column.getCanSort();
                    const colMeta = header.column.columnDef.meta as
                      ColumnMetaConfig | undefined;
                    const colWidth =
                      colMeta?.width ??
                      (header.column.columnDef.size !== 150
                        ? header.column.columnDef.size
                        : undefined);
                    const colMinWidth = colMeta?.minWidth;
                    const isLastCol = hIdx === headerGroup.headers.length - 1;
                    const isRightAligned =
                      header.id === "actions" ||
                      colMeta?.headerClassName?.includes("text-right");

                    return (
                      <th
                        key={header.id}
                        style={{
                          width:
                            colWidth !== undefined
                              ? typeof colWidth === "number"
                                ? `${colWidth}px`
                                : colWidth
                              : undefined,
                          minWidth:
                            colMinWidth !== undefined
                              ? typeof colMinWidth === "number"
                                ? `${colMinWidth}px`
                                : colMinWidth
                              : undefined,
                        }}
                        className={cn(
                          "px-3.5 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider select-none align-middle whitespace-nowrap overflow-hidden",
                          isLastCol && "pr-4 sm:pr-5",
                          isRightAligned && "text-right",
                          colMeta?.className,
                          colMeta?.headerClassName,
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={cn(
                              "inline-flex items-center gap-1.5 max-w-full min-w-0",
                              isRightAligned && "w-full justify-end text-right",
                              colMeta?.headerClassName?.includes(
                                "text-center",
                              ) && "w-full justify-center text-center",
                              canSort &&
                                "cursor-pointer hover:text-foreground transition-colors",
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span className="leading-tight whitespace-nowrap truncate">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            {canSort && (
                              <ArrowUpDown className="size-3 text-muted-foreground/70 shrink-0 inline-block" />
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {activeLoading ? (
                // Skeleton Rows
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    {columns.map((col, cIdx) => {
                      const colMeta = (col as { meta?: ColumnMetaConfig }).meta;
                      const colWidth =
                        colMeta?.width ??
                        (col.size !== 150 ? col.size : undefined);
                      const colMinWidth = colMeta?.minWidth;
                      const isLastCol = cIdx === columns.length - 1;
                      return (
                        <td
                          key={`skeleton-cell-${cIdx}`}
                          className={cn(
                            "px-3.5 py-3.5",
                            isLastCol && "pr-4 sm:pr-5",
                          )}
                          style={{
                            width:
                              colWidth !== undefined
                                ? typeof colWidth === "number"
                                  ? `${colWidth}px`
                                  : colWidth
                                : undefined,
                            minWidth:
                              colMinWidth !== undefined
                                ? typeof colMinWidth === "number"
                                  ? `${colMinWidth}px`
                                  : colMinWidth
                                : undefined,
                          }}
                        >
                          <div className="h-4 bg-muted/60 rounded-md w-3/4" />
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell, cIdx) => {
                      const colMeta = cell.column.columnDef.meta as
                        ColumnMetaConfig | undefined;
                      const colWidth =
                        colMeta?.width ??
                        (cell.column.columnDef.size !== 150
                          ? cell.column.columnDef.size
                          : undefined);
                      const colMinWidth = colMeta?.minWidth;
                      const isLastCol =
                        cIdx === row.getVisibleCells().length - 1;
                      const isActionsCol = cell.column.id === "actions";

                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-3.5 py-3.5 text-foreground align-middle",
                            isLastCol && "pr-4 sm:pr-5",
                            isActionsCol && "text-right",
                            colMeta?.className,
                            colMeta?.cellClassName,
                          )}
                          style={{
                            width:
                              colWidth !== undefined
                                ? typeof colWidth === "number"
                                  ? `${colWidth}px`
                                  : colWidth
                                : undefined,
                            minWidth:
                              colMinWidth !== undefined
                                ? typeof colMinWidth === "number"
                                  ? `${colMinWidth}px`
                                  : colMinWidth
                                : undefined,
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                // Empty State
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-6 py-12 text-center"
                  >
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Inbox className="w-8 h-8 text-muted-foreground/60" />
                      <div className="space-y-1">
                        <p className="text-base font-medium text-foreground">
                          {emptyTitle}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {emptyMessage}
                        </p>
                      </div>
                      {actionButton && (
                        <div className="pt-1">{actionButton}</div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && table.getRowModel().rows.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground bg-muted/20">
            <div>
              Showing{" "}
              <span className="font-medium text-foreground">
                {table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                  1}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                )}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {table.getFilteredRowModel().rows.length}
              </span>{" "}
              entries
            </div>
            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Rows per page
                </span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(val) => {
                    if (!val) return;
                    // Keep the reviewer's top row visible instead of jumping
                    // back to the first page on a page-size change.
                    const nextPageSize = Number(val);
                    const { pageIndex, pageSize } = table.getState().pagination;
                    table.setPageSize(nextPageSize);
                    table.setPageIndex(
                      pageIndexForResizedPage(
                        pageIndex,
                        pageSize,
                        nextPageSize,
                      ),
                    );
                  }}
                >
                  <SelectTrigger size="sm" className="h-7 w-[72px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    side="top"
                    align="end"
                    className="min-w-[72px] p-1"
                  >
                    {pageSizeOptions.map((size) => (
                      <SelectItem
                        key={size}
                        value={String(size)}
                        className="text-xs"
                      >
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <span className="text-xs font-medium px-2 whitespace-nowrap">
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {Math.max(1, table.getPageCount())}
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
          </div>
        )}
      </div>
    </div>
  );
}
