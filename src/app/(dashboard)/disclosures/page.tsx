'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileWarning, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/shared/data-table';
import { formatDate } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  required: 'warning',
  in_progress: 'default',
  submitted: 'default',
  reviewed: 'success',
  accepted: 'success',
  rejected: 'destructive',
};

const typeBadgeVariant: Record<string, BadgeVariant> = {
  seller_disclosure: 'default',
  lead_paint: 'warning',
  property_condition: 'secondary',
  natural_hazard: 'destructive',
  hoa: 'secondary',
  title: 'default',
  flood_zone: 'warning',
};

const typeLabels: Record<string, string> = {
  seller_disclosure: 'Seller Disclosure',
  lead_paint: 'Lead Paint',
  property_condition: 'Property Condition',
  natural_hazard: 'Natural Hazard',
  hoa: 'HOA',
  title: 'Title',
  flood_zone: 'Flood Zone',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'required', label: 'Required' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'seller_disclosure', label: 'Seller Disclosure' },
  { value: 'lead_paint', label: 'Lead Paint' },
  { value: 'property_condition', label: 'Property Condition' },
  { value: 'natural_hazard', label: 'Natural Hazard' },
  { value: 'hoa', label: 'HOA' },
  { value: 'title', label: 'Title' },
  { value: 'flood_zone', label: 'Flood Zone' },
];

interface DisclosureRow {
  id: string;
  title: string;
  disclosure_type: string;
  listing_address: string;
  status: string;
  due_date: string | null;
  assigned_to_name: string;
  is_overdue: boolean;
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false;
  if (status === 'accepted' || status === 'reviewed') return false;
  return new Date(dueDate) < new Date();
}

export default function DisclosuresPage() {
  const router = useRouter();

  const [disclosures, setDisclosures] = useState<DisclosureRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const fetchDisclosures = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy: 'due_date',
        sortOrder: 'asc',
      });

      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('disclosure_type', typeFilter);

      const res = await fetch(`/api/disclosures?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch disclosures');

      const json = await res.json();
      const data = json.data ?? [];
      const pagination = json.pagination;

      setDisclosures(
        data.map((d: any) => ({
          id: d.id,
          title: d.title,
          disclosure_type: d.disclosure_type,
          listing_address: d.listing?.address ?? '--',
          status: d.status,
          due_date: d.due_date,
          assigned_to_name: d.assigned_to_profile?.full_name ?? d.assigned_to_profile?.email ?? '--',
          is_overdue: isOverdue(d.due_date, d.status),
        }))
      );

      if (pagination) {
        setTotalPages(pagination.totalPages ?? 1);
      }
    } catch (err) {
      console.error('Error fetching disclosures:', err);
      setDisclosures([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, statusFilter, typeFilter]);

  useEffect(() => {
    fetchDisclosures();
  }, [fetchDisclosures]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(e.target.value);
    setCurrentPage(1);
  };

  const columns: Column<DisclosureRow>[] = [
    {
      header: 'Title',
      accessor: 'title',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <FileWarning className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="font-medium">{row.title}</span>
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'disclosure_type',
      render: (value) => (
        <Badge variant={typeBadgeVariant[String(value)] ?? 'secondary'}>
          {typeLabels[String(value)] ?? String(value)}
        </Badge>
      ),
    },
    {
      header: 'Listing',
      accessor: 'listing_address',
      render: (value) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {String(value)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (value, row) => {
        const statusLabel = String(value)
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        if (row.is_overdue) {
          return <Badge variant="destructive">Overdue</Badge>;
        }
        return (
          <Badge variant={statusBadgeVariant[String(value)] ?? 'secondary'}>
            {statusLabel}
          </Badge>
        );
      },
    },
    {
      header: 'Due Date',
      accessor: 'due_date',
      sortable: true,
      render: (value, row) => {
        if (!value) return <span className="text-gray-400">--</span>;
        return (
          <span className={row.is_overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>
            {formatDate(String(value))}
          </span>
        );
      },
    },
    {
      header: 'Assigned To',
      accessor: 'assigned_to_name',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Disclosures</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track and manage property disclosures and their statuses.
          </p>
        </div>
        <Button onClick={() => router.push('/disclosures/new')}>
          <Plus className="h-4 w-4" />
          New Disclosure
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={handleStatusChange}
              className="w-full sm:w-48"
            />
            <Select
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={handleTypeChange}
              className="w-full sm:w-52"
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={disclosures}
            isLoading={isLoading}
            emptyMessage="No disclosures found"
            emptyDescription="Create your first disclosure to get started."
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/disclosures/${row.id}`)}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
