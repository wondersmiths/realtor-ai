'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/shared/search-input';
import { DataTable, type Column } from '@/components/shared/data-table';
import { formatDate } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  running: 'default',
  completed: 'success',
  failed: 'destructive',
};

const checkTypeLabels: Record<string, string> = {
  fair_housing: 'Fair Housing',
  listing_compliance: 'Listing Compliance',
  document_review: 'Document Review',
  disclosure_completeness: 'Disclosure Completeness',
};

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'fair_housing', label: 'Fair Housing' },
  { value: 'listing_compliance', label: 'Listing Compliance' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'disclosure_completeness', label: 'Disclosure Completeness' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

interface CheckRow {
  id: string;
  check_type: string;
  resource_name: string;
  status: string;
  score: number | null;
  initiated_by_name: string;
  created_at: string;
}

export default function ComplianceChecksPage() {
  const router = useRouter();

  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const fetchChecks = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      if (search) params.set('search', search);
      if (typeFilter) params.set('check_type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/compliance/checks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch compliance checks');

      const json = await res.json();
      const data = json.data ?? [];
      const pagination = json.pagination;

      setChecks(
        data.map((c: any) => ({
          id: c.id,
          check_type: c.check_type,
          resource_name: c.listing?.address ?? c.document?.name ?? '--',
          status: c.status,
          score: c.score,
          initiated_by_name: c.initiated_by_profile?.full_name ?? c.initiated_by_profile?.email ?? '--',
          created_at: c.created_at,
        }))
      );

      if (pagination) {
        setTotalPages(pagination.totalPages ?? 1);
      }
    } catch (err) {
      console.error('Error fetching compliance checks:', err);
      setChecks([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setCurrentPage(1);
  }, []);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const columns: Column<CheckRow>[] = [
    {
      header: 'Type',
      accessor: 'check_type',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="font-medium">
            {checkTypeLabels[row.check_type] ?? row.check_type}
          </span>
        </div>
      ),
    },
    {
      header: 'Resource',
      accessor: 'resource_name',
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (value) => (
        <Badge variant={statusBadgeVariant[String(value)] ?? 'secondary'}>
          {String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      header: 'Score',
      accessor: 'score',
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
        return <span className={`font-semibold ${color}`}>{score}</span>;
      },
    },
    {
      header: 'Initiated By',
      accessor: 'initiated_by_name',
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Compliance Checks</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View and manage all compliance checks across your organization.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SearchInput
              onSearch={handleSearch}
              placeholder="Search checks..."
              className="flex-1"
            />
            <Select
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={handleTypeChange}
              className="w-full sm:w-52"
            />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={handleStatusChange}
              className="w-full sm:w-44"
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={checks}
            isLoading={isLoading}
            emptyMessage="No compliance checks found"
            emptyDescription="Compliance checks will appear here once created."
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/compliance/checks/${row.id}`)}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
