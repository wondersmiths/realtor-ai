'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/shared/search-input';
import { DataTable, type Column } from '@/components/shared/data-table';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/utils';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'user.sign_in', label: 'User Sign In' },
  { value: 'user.sign_up', label: 'User Sign Up' },
  { value: 'org.updated', label: 'Org Updated' },
  { value: 'org.member_invited', label: 'Member Invited' },
  { value: 'org.member_removed', label: 'Member Removed' },
  { value: 'org.member_role_changed', label: 'Role Changed' },
  { value: 'document.uploaded', label: 'Document Uploaded' },
  { value: 'document.updated', label: 'Document Updated' },
  { value: 'document.deleted', label: 'Document Deleted' },
  { value: 'document.reviewed', label: 'Document Reviewed' },
  { value: 'listing.created', label: 'Listing Created' },
  { value: 'listing.updated', label: 'Listing Updated' },
  { value: 'listing.deleted', label: 'Listing Deleted' },
  { value: 'compliance.check_started', label: 'Check Started' },
  { value: 'compliance.check_completed', label: 'Check Completed' },
  { value: 'disclosure.created', label: 'Disclosure Created' },
  { value: 'disclosure.updated', label: 'Disclosure Updated' },
  { value: 'fair_housing.check_run', label: 'Fair Housing Check' },
  { value: 'billing.subscription_created', label: 'Subscription Created' },
  { value: 'billing.payment_succeeded', label: 'Payment Succeeded' },
  { value: 'billing.payment_failed', label: 'Payment Failed' },
];

interface AuditLogRow {
  id: string;
  action: string;
  user_name: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
}

function formatAction(action: string): string {
  return action
    .replace(/\./g, ' > ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  // Redirect non-admin users
  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const fetchLogs = useCallback(async () => {
    if (!currentOrg) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      if (search) params.set('search', search);
      if (actionFilter) params.set('action', actionFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/organizations/${currentOrg.id}/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');

      const json = await res.json();
      const data = json.data ?? [];
      const pagination = json.pagination;

      setLogs(
        data.map((log: any) => ({
          id: log.id,
          action: log.action,
          user_name: log.user?.full_name ?? log.user?.email ?? log.user_id ?? '--',
          resource_type: log.resource_type ?? '--',
          resource_id: log.resource_id,
          ip_address: log.ip_address,
          created_at: log.created_at,
        }))
      );

      if (pagination) {
        setTotalPages(pagination.totalPages ?? 1);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg, currentPage, search, actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchLogs();
    }
  }, [fetchLogs, isOwner, isAdmin]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setCurrentPage(1);
  }, []);

  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActionFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;

    const headers = ['Action', 'User', 'Resource Type', 'Resource ID', 'IP Address', 'Date'];
    const rows = logs.map((log) => [
      log.action,
      log.user_name,
      log.resource_type,
      log.resource_id ?? '',
      log.ip_address ?? '',
      log.created_at,
    ]);

    const csvContent =
      [headers.join(','), ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Don't render for non-admin
  if (!isOwner && !isAdmin) {
    return null;
  }

  const columns: Column<AuditLogRow>[] = [
    {
      header: 'Action',
      accessor: 'action',
      render: (value) => (
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="font-medium text-sm">{formatAction(String(value))}</span>
        </div>
      ),
    },
    {
      header: 'User',
      accessor: 'user_name',
    },
    {
      header: 'Resource',
      accessor: 'resource_type',
      render: (value, row) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          {row.resource_id && (
            <span className="ml-1 font-mono text-xs text-gray-400">
              ({row.resource_id.slice(0, 8)}...)
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'IP Address',
      accessor: 'ip_address',
      render: (value) => (
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
          {value ? String(value) : '--'}
        </span>
      ),
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View all actions and changes across your organization.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={logs.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <SearchInput
                onSearch={handleSearch}
                placeholder="Search by user, action..."
                className="flex-1"
              />
              <Select
                options={ACTION_OPTIONS}
                value={actionFilter}
                onChange={handleActionChange}
                className="w-full sm:w-56"
              />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Input
                label="From"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full sm:w-48"
              />
              <Input
                label="To"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full sm:w-48"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={logs}
            isLoading={isLoading}
            emptyMessage="No audit log entries found"
            emptyDescription="Activity will be logged here as actions are performed."
            rowKey={(row) => row.id}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
