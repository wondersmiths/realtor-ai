'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/shared/search-input';
import { DataTable, type Column } from '@/components/shared/data-table';
import { formatDate } from '@/lib/utils';
import type { DocumentWithUploader } from '@/types/domain';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  reviewing: 'default',
  reviewed: 'success',
  flagged: 'destructive',
  approved: 'success',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'approved', label: 'Approved' },
];

interface DocumentRow {
  id: string;
  name: string;
  file_type: string;
  status: string;
  review_score: number | null;
  uploader_name: string;
  created_at: string;
}

export default function DocumentsPage() {
  const router = useRouter();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const fetchDocuments = useCallback(async () => {
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

      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch documents');

      const json = await res.json();
      const docs: DocumentWithUploader[] = json.data ?? [];
      const pagination = json.pagination;

      setDocuments(
        docs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          file_type: doc.file_type,
          status: doc.status,
          review_score: doc.review_score,
          uploader_name: doc.uploader?.full_name ?? doc.uploader?.email ?? 'Unknown',
          created_at: doc.created_at,
        }))
      );

      if (pagination) {
        setTotalPages(pagination.totalPages ?? 1);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, statusFilter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const columns: Column<DocumentRow>[] = [
    {
      header: 'Name',
      accessor: 'name',
      sortable: true,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'file_type',
      render: (value) => (
        <span className="uppercase text-xs text-gray-500 dark:text-gray-400">
          {String(value)}
        </span>
      ),
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
      accessor: 'review_score',
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
      header: 'Uploaded By',
      accessor: 'uploader_name',
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Documents</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage and review your compliance documents.
          </p>
        </div>
        <Button onClick={() => router.push('/documents/upload')}>
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SearchInput
              onSearch={handleSearch}
              placeholder="Search documents..."
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
            data={documents}
            isLoading={isLoading}
            emptyMessage="No documents found"
            emptyDescription="Upload your first document to get started."
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/documents/${row.id}`)}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
