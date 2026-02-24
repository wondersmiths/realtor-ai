'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Trash2,
  Send,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import { useToast } from '@/providers/toast-provider';
import type { DocumentWithUploader, ComplianceFinding } from '@/types/domain';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  pending: 'warning',
  reviewing: 'default',
  reviewed: 'success',
  flagged: 'destructive',
  approved: 'success',
};

const severityConfig: Record<string, { icon: typeof Info; variant: BadgeVariant; color: string }> = {
  info: { icon: Info, variant: 'default', color: 'text-blue-500' },
  warning: { icon: AlertTriangle, variant: 'warning', color: 'text-yellow-500' },
  error: { icon: XCircle, variant: 'destructive', color: 'text-red-500' },
  critical: { icon: XCircle, variant: 'destructive', color: 'text-red-700' },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { addToast } = useToast();

  const [document, setDocument] = useState<DocumentWithUploader | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRequestingReview, setIsRequestingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Document not found');
          return;
        }
        throw new Error('Failed to fetch document');
      }
      const json = await res.json();
      setDocument(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const handleRequestReview = async () => {
    setIsRequestingReview(true);
    try {
      const res = await fetch(`/api/documents/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to request review');
      addToast({ type: 'success', title: 'Review requested', message: 'The document has been queued for AI review.' });
      fetchDocument();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to request document review.' });
    } finally {
      setIsRequestingReview(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');
      addToast({ type: 'success', title: 'Document deleted' });
      router.push('/documents');
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete document.' });
      setIsDeleting(false);
    }
  };

  const handleDownload = () => {
    // Trigger download via a link (file_path is the storage path)
    window.open(`/api/documents/${id}?download=true`, '_blank');
  };

  if (isLoading) {
    return <LoadingState message="Loading document..." />;
  }

  if (error || !document) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/documents')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">{error ?? 'Document not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const findings = (document.review_findings ?? []) as ComplianceFinding[];
  const isReviewed = document.status === 'reviewed' || document.status === 'flagged' || document.status === 'approved';

  const scoreColor =
    document.review_score !== null
      ? document.review_score >= 80
        ? 'text-green-600 dark:text-green-400'
        : document.review_score >= 60
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400'
      : '';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/documents')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Documents
      </button>

      {/* Document Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>{document.name}</CardTitle>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Uploaded {formatRelativeDate(document.created_at)}
                </p>
              </div>
            </div>
            <Badge variant={statusBadgeVariant[document.status] ?? 'secondary'}>
              {document.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 uppercase">
                {document.file_type}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Size</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatFileSize(document.file_size)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Uploaded By</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {document.uploader?.full_name ?? document.uploader?.email ?? 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Date</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatDate(document.created_at)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            {!isReviewed && (
              <Button
                onClick={handleRequestReview}
                loading={isRequestingReview}
                disabled={document.status === 'reviewing'}
              >
                <Send className="h-4 w-4" />
                {document.status === 'reviewing' ? 'Review In Progress' : 'Request Review'}
              </Button>
            )}
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button variant="destructive" onClick={handleDelete} loading={isDeleting}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review Results */}
      {isReviewed && (
        <Card>
          <CardHeader>
            <CardTitle>Review Results</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Score */}
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-gray-200 dark:border-gray-700">
                <span className={`text-2xl font-bold ${scoreColor}`}>
                  {document.review_score ?? '--'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Compliance Score
                </p>
                {document.reviewed_at && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reviewed on {formatDate(document.reviewed_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Findings */}
            {findings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  No issues found. This document looks compliant.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Findings ({findings.length})
                </h4>
                <ul className="space-y-2">
                  {findings.map((finding, index) => {
                    const config = severityConfig[finding.severity] ?? severityConfig.info;
                    const SeverityIcon = config.icon;
                    return (
                      <li
                        key={index}
                        className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                      >
                        <div className="flex items-start gap-3">
                          <SeverityIcon className={`mt-0.5 h-5 w-5 shrink-0 ${config.color}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {finding.message}
                              </p>
                              <Badge variant={config.variant} className="shrink-0">
                                {finding.severity}
                              </Badge>
                            </div>
                            {finding.location && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Location: {finding.location}
                              </p>
                            )}
                            {finding.suggestion && (
                              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                Suggestion: {finding.suggestion}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
