'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  sortableKey?: keyof T | string;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  bulkActions?: (selectedItems: T[]) => React.ReactNode;
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyTitle = 'No data available',
  emptyDescription = 'There are no records matching your current request or filter.',
  emptyAction,
  isLoading = false,
  searchPlaceholder = 'Search records...',
  searchFilter,
  bulkActions,
  pageSize = 10,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredData = useMemo(() => {
    let result = data;
    if (searchQuery.trim()) {
      if (searchFilter) {
        result = result.filter((item) => searchFilter(item, searchQuery.toLowerCase()));
      } else {
        result = result.filter((item) =>
          JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const valA = (a as Record<string, unknown>)[sortKey];
        const valB = (b as Record<string, unknown>)[sortKey];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        const comp = String(valA).localeCompare(String(valB));
        return sortDirection === 'asc' ? comp : -comp;
      });
    }

    return result;
  }, [data, searchQuery, searchFilter, sortKey, sortDirection]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedKeys(new Set(paginatedData.map(keyExtractor)));
    } else {
      setSelectedKeys(new Set());
    }
  };

  const handleSelectRow = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const selectedItems = useMemo(() => {
    return data.filter((item) => selectedKeys.has(keyExtractor(item)));
  }, [data, selectedKeys, keyExtractor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ width: '280px', maxWidth: '100%' }}>
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            leftIcon={<Search size={14} />}
          />
        </div>

        {bulkActions && selectedKeys.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', backgroundColor: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
              {selectedKeys.size} selected
            </span>
            {bulkActions(selectedItems)}
          </div>
        )}
      </div>

      <div className="table-container" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <table className="dense-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {bulkActions && (
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && selectedKeys.size === paginatedData.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
              )}
              {columns.map((col, index) => (
                <th
                  key={index}
                  className={col.className || ''}
                  style={{ cursor: col.sortableKey ? 'pointer' : undefined }}
                  onClick={() => col.sortableKey && handleSort(String(col.sortableKey))}
                >
                  {col.header}
                  {col.sortableKey && sortKey === String(col.sortableKey) && (
                    <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i}>
                  {bulkActions && (
                    <td style={{ textAlign: 'center' }}>
                      <Skeleton width="14px" height="14px" />
                    </td>
                  )}
                  {columns.map((_, colIdx) => (
                    <td key={colIdx}>
                      <Skeleton height="1.1rem" width="80%" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (bulkActions ? 1 : 0)} style={{ padding: 0 }}>
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const key = keyExtractor(item);
                const isSelected = selectedKeys.has(key);
                return (
                  <tr key={key} style={{ backgroundColor: isSelected ? 'var(--bg-hover)' : undefined }}>
                    {bulkActions && (
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(key)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    {columns.map((col, index) => (
                      <td key={index} className={col.className || ''}>
                        {col.accessor(item)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && filteredData.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div>
            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredData.length)} to{' '}
            {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} entries
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              leftIcon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', padding: '0 8px' }}>
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              rightIcon={<ChevronRight size={14} />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
