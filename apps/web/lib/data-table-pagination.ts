/**
 * Pagination rules for the shared `EntityDataTable`.
 *
 * The table keeps the reviewer on the page they were working on: add, edit and
 * delete replace the `data` array but must not teleport the reviewer back to
 * page 1 (TanStack resets the page index on every data change by default), while
 * a new search / filter / sort query is a new result set and does start from the
 * first page. These are the pure decisions behind that behaviour.
 */

export interface DataTableQuery {
  globalFilter: string;
  columnFilters: unknown;
  sorting: unknown;
  /** Signature of page-level filters that reshape `data` before the table sees it. */
  resetPageKey?: string | number | boolean;
}

/**
 * Identity of the current query. The table compares consecutive signatures to
 * decide whether the page index must start over.
 */
export function dataTableQuerySignature(query: DataTableQuery): string {
  return [
    query.globalFilter,
    JSON.stringify(query.columnFilters),
    JSON.stringify(query.sorting),
    query.resetPageKey ?? "",
  ].join("|");
}

/**
 * Keeps the page index inside the pages that exist.
 *
 * Deleting the last row of the last page must land on the page that still has
 * rows instead of an empty one. An empty result set (pageCount 0) leaves the
 * index untouched so the table can show its empty state without losing the
 * reviewer's position.
 */
export function clampPageIndex(pageIndex: number, pageCount: number): number {
  const safeIndex = Math.max(0, Math.floor(pageIndex));
  if (pageCount <= 0) return safeIndex;
  return Math.min(safeIndex, pageCount - 1);
}

/**
 * Page index that keeps the current top row visible after a page-size change,
 * mirroring the review position instead of jumping back to the first page.
 */
export function pageIndexForResizedPage(
  pageIndex: number,
  pageSize: number,
  nextPageSize: number,
): number {
  const safeSize = Math.max(1, Math.floor(nextPageSize));
  const topRowIndex = Math.max(0, pageIndex) * Math.max(1, pageSize);
  return Math.floor(topRowIndex / safeSize);
}
