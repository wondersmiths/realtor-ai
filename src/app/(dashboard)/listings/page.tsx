'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/shared/search-input';
import { DataTable, type Column } from '@/components/shared/data-table';
import { formatDate } from '@/lib/utils';
import type { ListingWithAgent } from '@/types/domain';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  draft: 'secondary',
  active: 'success',
  pending: 'warning',
  sold: 'default',
  withdrawn: 'destructive',
  expired: 'destructive',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'sold', label: 'Sold' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'expired', label: 'Expired' },
];

interface ListingRow {
  id: string;
  address: string;
  mls_number: string | null;
  listing_status: string;
  compliance_score: number | null;
  agent_name: string;
  created_at: string;
}

export default function ListingsPage() {
  const router = useRouter();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/listings?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch listings');

      const json = await res.json();
      const data: ListingWithAgent[] = json.data ?? [];
      const pagination = json.pagination;

      setListings(
        data.map((l) => ({
          id: l.id,
          address: l.address,
          mls_number: l.mls_number,
          listing_status: l.listing_status,
          compliance_score: l.compliance_score,
          agent_name: l.agent?.full_name ?? l.agent?.email ?? 'Unassigned',
          created_at: l.created_at,
        }))
      );

      if (pagination) {
        setTotalPages(pagination.totalPages ?? 1);
      }
    } catch (err) {
      console.error('Error fetching listings:', err);
      setListings([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, statusFilter]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const columns: Column<ListingRow>[] = [
    {
      header: 'Address',
      accessor: 'address',
      sortable: true,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate font-medium">{row.address}</span>
        </div>
      ),
    },
    {
      header: 'MLS#',
      accessor: 'mls_number',
      render: (value) =>
        value ? (
          <span className="font-mono text-sm">{String(value)}</span>
        ) : (
          <span className="text-gray-400">--</span>
        ),
    },
    {
      header: 'Status',
      accessor: 'listing_status',
      render: (value) => (
        <Badge variant={statusBadgeVariant[String(value)] ?? 'secondary'}>
          {String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      header: 'Compliance Score',
      accessor: 'compliance_score',
      sortable: true,
      render: (value) => {
        if (value === null || value === undefined) return <span className="text-gray-400">--</span>;
        const score = Number(value);
        const color =
          score >= 80
            ? 'text-green-600 dark:text-green-400'
            : score >= 60
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-red-600 dark:text-red-400';
        return <span className={`font-semibold ${color}`}>{score}%</span>;
      },
    },
    {
      header: 'Agent',
      accessor: 'agent_name',
    },
    {
      header: 'Date',
      accessor: 'created_at',
      sortable: true,
      render: (value) => formatDate(String(value)),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Listings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your property listings and compliance status.
          </p>
        </div>
        <Button onClick={() => router.push('/listings/new')}>
          <Plus className="h-4 w-4" />
          New Listing
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SearchInput
              onSearch={handleSearch}
              placeholder="Search by address, MLS#..."
              className="flex-1"
            />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={handleStatusChange}
              className="w-full sm:w-48"
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={listings}
            isLoading={isLoading}
            emptyMessage="No listings found"
            emptyDescription="Create your first listing to get started."
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/listings/${row.id}`)}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
