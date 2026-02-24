'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ShieldCheck,
  Bot,
  Info,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/shared/loading-state';
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

const severityConfig: Record<string, { icon: typeof Info; variant: BadgeVariant; color: string }> = {
  info: { icon: Info, variant: 'default', color: 'text-blue-500' },
  warning: { icon: AlertTriangle, variant: 'warning', color: 'text-yellow-500' },
  error: { icon: XCircle, variant: 'destructive', color: 'text-red-500' },
  critical: { icon: XCircle, variant: 'destructive', color: 'text-red-700' },
};

interface Finding {
  type: string;
  severity: string;
  message: string;
  location?: string;
  suggestion?: string;
}

interface CheckDetail {
  id: string;
  check_type: string;
  status: string;
  score: number | null;
  ai_used: boolean;
  model_used: string | null;
  tokens_used: number | null;
  findings: Finding[];
  summary: string | null;
  listing?: { id: string; address: string; mls_number: string | null } | null;
  document?: { id: string; name: string; file_type: string } | null;
  initiated_by_profile?: { full_name: string | null; email: string } | null;
  completed_at: string | null;
  created_at: string;
}

export default function ComplianceCheckDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCheck = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compliance/checks/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Compliance check not found');
          return;
        }
        throw new Error('Failed to fetch compliance check');
      }
      const json = await res.json();
      setCheck(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCheck();
  }, [fetchCheck]);

  if (isLoading) {
    return <LoadingState message="Loading compliance check..." />;
  }

  if (error || !check) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/compliance/checks')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Checks
        </button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">{error ?? 'Check not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scoreColor =
    check.score !== null
      ? check.score >= 80
        ? 'text-green-600 dark:text-green-400'
        : check.score >= 60
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400'
      : '';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/compliance/checks')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Checks
      </button>

      {/* Check Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>
                  {checkTypeLabels[check.check_type] ?? check.check_type}
                </CardTitle>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Created {formatDate(check.created_at)}
                </p>
              </div>
            </div>
            <Badge variant={statusBadgeVariant[check.status] ?? 'secondary'}>
              {check.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Score</p>
              <p className={`mt-1 text-2xl font-bold ${scoreColor}`}>
                {check.score !== null ? check.score : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">AI Used</p>
              <div className="mt-1 flex items-center gap-1.5">
                {check.ai_used ? (
                  <>
                    <Bot className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">Yes</span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-gray-500">No</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Model</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {check.model_used ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Tokens Used</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {check.tokens_used !== null ? check.tokens_used.toLocaleString() : '--'}
              </p>
            </div>
          </div>

          {/* Initiated By */}
          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Initiated By
            </p>
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {check.initiated_by_profile?.full_name ?? check.initiated_by_profile?.email ?? '--'}
            </p>
          </div>

          {check.completed_at && (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Completed At
              </p>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {formatDate(check.completed_at)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related Resource */}
      {(check.listing || check.document) && (
        <Card>
          <CardHeader>
            <CardTitle>Related Resource</CardTitle>
          </CardHeader>
          <CardContent>
            {check.listing && (
              <button
                onClick={() => router.push(`/listings/${check.listing!.id}`)}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Listing: {check.listing.address}
                {check.listing.mls_number && (
                  <span className="text-gray-400">({check.listing.mls_number})</span>
                )}
              </button>
            )}
            {check.document && (
              <button
                onClick={() => router.push(`/documents/${check.document!.id}`)}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Document: {check.document.name}
                <span className="text-xs uppercase text-gray-400">({check.document.file_type})</span>
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {check.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {check.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Findings ({check.findings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {check.findings.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <Info className="h-5 w-5 text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                No issues found. This check passed cleanly.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {check.findings.map((finding, index) => {
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {finding.message}
                          </p>
                          <Badge variant={config.variant} className="shrink-0">
                            {finding.severity}
                          </Badge>
                          <Badge variant="secondary" className="shrink-0">
                            {finding.type}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
