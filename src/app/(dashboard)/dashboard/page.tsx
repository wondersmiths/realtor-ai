'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Home,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Plus,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/hooks/use-user';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { Document } from '@/types/database';
import type { ComplianceCheckWithDetails, DisclosureWithDetails } from '@/types/domain';

interface DashboardStats {
  totalDocuments: number;
  activeListings: number;
  complianceScore: number;
  pendingDisclosures: number;
}

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending: 'warning',
  reviewing: 'default',
  reviewed: 'success',
  flagged: 'destructive',
  approved: 'success',
  completed: 'success',
  failed: 'destructive',
  running: 'default',
  required: 'warning',
  in_progress: 'default',
  overdue: 'destructive',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useUser();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentChecks, setRecentChecks] = useState<ComplianceCheckWithDetails[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<Document[]>([]);
  const [overdueDisclosures, setOverdueDisclosures] = useState<DisclosureWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [documentsRes, listingsRes, checksRes, disclosuresRes] = await Promise.all([
        fetch('/api/documents?pageSize=100'),
        fetch('/api/listings?pageSize=100'),
        fetch('/api/compliance/checks?pageSize=5&sortBy=created_at&sortOrder=desc'),
        fetch('/api/disclosures?pageSize=100'),
      ]);

      if (!documentsRes.ok || !listingsRes.ok || !checksRes.ok || !disclosuresRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [documentsData, listingsData, checksData, disclosuresData] = await Promise.all([
        documentsRes.json(),
        listingsRes.json(),
        checksRes.json(),
        disclosuresRes.json(),
      ]);

      // Calculate stats
      const documents = documentsData.data ?? [];
      const listings = listingsData.data ?? [];
      const allChecks = checksData.data ?? [];
      const disclosures = disclosuresData.data ?? [];

      const activeListings = listings.filter(
        (l: { listing_status: string }) => l.listing_status === 'active'
      );

      const scores = listings
        .map((l: { compliance_score: number | null }) => l.compliance_score)
        .filter((s: number | null): s is number => s !== null);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : 0;

      const now = new Date();
      const pendingDisc = disclosures.filter(
        (d: { status: string; due_date: string | null }) =>
          (d.status === 'required' || d.status === 'in_progress')
      );
      const overdue = disclosures.filter(
        (d: { status: string; due_date: string | null }) =>
          d.due_date &&
          new Date(d.due_date) < now &&
          d.status !== 'accepted' &&
          d.status !== 'reviewed'
      );

      setStats({
        totalDocuments: documentsData.pagination?.total ?? documents.length,
        activeListings: activeListings.length,
        complianceScore: avgScore,
        pendingDisclosures: pendingDisc.length,
      });

      setRecentChecks(allChecks.slice(0, 5));

      const pending = documents
        .filter((d: Document) => d.status === 'pending')
        .slice(0, 5);
      setPendingDocuments(pending);

      setOverdueDisclosures(overdue.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there';

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Here is an overview of your compliance status and recent activity.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => router.push('/documents/upload')}>
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
        <Button variant="outline" onClick={() => router.push('/listings/new')}>
          <Plus className="h-4 w-4" />
          New Listing
        </Button>
        <Button variant="outline" onClick={() => router.push('/compliance/fair-housing')}>
          <Search className="h-4 w-4" />
          Run Fair Housing Check
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardContent className="py-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchDashboardData}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Documents"
          value={stats?.totalDocuments}
          icon={FileText}
          isLoading={isLoading}
        />
        <StatsCard
          title="Active Listings"
          value={stats?.activeListings}
          icon={Home}
          isLoading={isLoading}
        />
        <StatsCard
          title="Compliance Score"
          value={stats?.complianceScore !== undefined ? `${stats.complianceScore}%` : undefined}
          icon={ShieldCheck}
          isLoading={isLoading}
          valueClassName={
            stats?.complianceScore !== undefined
              ? stats.complianceScore >= 80
                ? 'text-green-600 dark:text-green-400'
                : stats.complianceScore >= 60
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              : undefined
          }
        />
        <StatsCard
          title="Pending Disclosures"
          value={stats?.pendingDisclosures}
          icon={AlertTriangle}
          isLoading={isLoading}
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Compliance Checks */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Compliance Checks</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : recentChecks.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No compliance checks yet
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentChecks.map((check) => (
                  <li
                    key={check.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {check.check_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeDate(check.created_at)}
                        {check.listing?.address && ` - ${check.listing.address}`}
                      </p>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      {check.score !== null && (
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {check.score}%
                        </span>
                      )}
                      <Badge variant={statusBadgeVariant[check.status] ?? 'secondary'}>
                        {check.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Documents Needing Review */}
        <Card>
          <CardHeader>
            <CardTitle>Documents Needing Review</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : pendingDocuments.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No documents pending review
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {pendingDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex cursor-pointer items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {doc.file_type} - {formatDate(doc.created_at)}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Overdue Disclosures */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Overdue Disclosures
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-60" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : overdueDisclosures.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No overdue disclosures -- you are all caught up!
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {overdueDisclosures.map((disc) => (
                  <li
                    key={disc.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {disc.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {disc.disclosure_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        {disc.listing?.address && ` - ${disc.listing.address}`}
                        {disc.due_date && ` - Due: ${formatDate(disc.due_date)}`}
                      </p>
                    </div>
                    <Badge variant="destructive">Overdue</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Stats Card Sub-Component
// ────────────────────────────────────────────

interface StatsCardProps {
  title: string;
  value: string | number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  isLoading: boolean;
  valueClassName?: string;
}

function StatsCard({ title, value, icon: Icon, isLoading, valueClassName }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="mt-3">
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <p className={`text-2xl font-bold text-gray-900 dark:text-gray-50 ${valueClassName ?? ''}`}>
              {value ?? 0}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
