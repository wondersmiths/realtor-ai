'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './empty-state';
import { Pagination } from './pagination';

// ────────────────────────────────────────────
// Column definition
// ────────────────────────────────────────────

export interface Column<T> {
  header: string;
  accessor: keyof T & string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

// ────────────────────────────────────────────
// Sort state
// ────────────────────────────────────────────

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  sort?: SortState;
  onSort?: (sort: SortState) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No results found',
  emptyDescription,
  sort,
  onSort,
  currentPage,
  totalPages,
  onPageChange,
  rowKey,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSort) return;

    const isSameColumn = sort?.column === column.accessor;
    const direction: 'asc' | 'desc' =
      isSameColumn && sort?.direction === 'asc' ? 'desc' : 'asc';

    onSort({ column: column.accessor, direction });
  };

  const getSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null;

    if (sort?.column !== column.accessor) {
      return <ArrowUpDown className="ml-1 inline-block h-3.5 w-3.5 text-gray-400" />;
    }

    return sort.direction === 'asc' ? (
      <ArrowUp className="ml-1 inline-block h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline-block h-3.5 w-3.5" />
    );
  };

  // ────── Loading skeleton ──────
  if (isLoading) {
    return (
      <div className={className}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.accessor}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.accessor}>
                    <Skeleton className="h-4 w-full max-w-[200px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // ────── Empty state ──────
  if (data.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} description={emptyDescription} />
      </div>
    );
  }

  // ────── Data table ──────
  return (
    <div className={cn('space-y-4', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.accessor}
                className={cn(
                  col.sortable && 'cursor-pointer select-none',
                  col.className
                )}
                onClick={() => handleSort(col)}
              >
                {col.header}
                {getSortIcon(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIdx) => (
            <TableRow
              key={rowKey ? rowKey(row) : rowIdx}
              className={cn(onRowClick && 'cursor-pointer')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <TableCell key={col.accessor} className={col.className}>
                  {col.render
                    ? col.render(row[col.accessor], row)
                    : (row[col.accessor] as React.ReactNode) ?? '-'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {currentPage !== undefined &&
        totalPages !== undefined &&
        onPageChange !== undefined && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        )}
    </div>
  );
}
