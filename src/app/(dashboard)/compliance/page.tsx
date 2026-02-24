'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

interface ComplianceStats {
  totalChecks: number;
  passRate: number;
  avgScore: number;
  activeViolations: number;
  overallScore: number;
}

interface CheckRow {
  id: string;
  check_type: string;
  status: string;
  score: number | null;
  created_at: string;
  resource_name: string;
}

interface TypeBreakdown {
  type: string;
  count: number;
  avgScore: number;
  passRate: number;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
  return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
}

export default function ComplianceDashboardPage() {
  const [stats, setStats] = useState<ComplianceStats | null>(null);
  const [recentChecks, setRecentChecks] = useState<CheckRow[]>([]);
  const [typeBreakdowns, setTypeBreakdowns] = useState<TypeBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/compliance/checks?pageSize=50&sortBy=created_at&sortOrder=desc');
      if (!res.ok) throw new Error('Failed to fetch compliance data');

      const json = await res.json();
      const checks = json.data ?? [];

      // Compute stats from the checks data
      const completedChecks = checks.filter((c: any) => c.status === 'completed');
      const scores = completedChecks
        .map((c: any) => c.score)
        .filter((s: any) => s !== null && s !== undefined) as number[];

      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : 0;

      const passCount = scores.filter((s: number) => s >= 70).length;
      const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;

      const activeViolations = checks.filter(
        (c: any) => c.status === 'completed' && c.score !== null && c.score < 70
      ).length;

      setStats({
        totalChecks: checks.length,
        passRate,
        avgScore,
        activeViolations,
        overallScore: avgScore,
      });

      // Map recent checks
      setRecentChecks(
        checks.slice(0, 10).map((c: any) => ({
          id: c.id,
          check_type: c.check_type,
          status: c.status,
          score: c.score,
          created_at: c.created_at,
          resource_name: c.listing?.address ?? c.document?.name ?? '--',
        }))
      );

      // Compute type breakdowns
      const typeMap: Record<string, { count: number; scores: number[] }> = {};
      const types = ['fair_housing', 'listing_compliance', 'document_review', 'disclosure_completeness'];
      types.forEach((t) => {
        typeMap[t] = { count: 0, scores: [] };
      });

      checks.forEach((c: any) => {
        if (typeMap[c.check_type]) {
          typeMap[c.check_type].count++;
          if (c.score !== null && c.score !== undefined && c.status === 'completed') {
            typeMap[c.check_type].scores.push(c.score);
          }
        }
      });

      setTypeBreakdowns(
        types.map((t) => {
          const { count, scores: typeScores } = typeMap[t];
          const typeAvg = typeScores.length > 0
            ? Math.round(typeScores.reduce((a, b) => a + b, 0) / typeScores.length)
            : 0;
          const typePass = typeScores.length > 0
            ? Math.round((typeScores.filter((s) => s >= 70).length / typeScores.length) * 100)
            : 0;
          return { type: t, count, avgScore: typeAvg, passRate: typePass };
        })
      );
    } catch (err) {
      console.error('Error fetching compliance data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Mock trend data for the simple bar chart
  const trendData = [
    { month: 'Sep', score: 68 },
    { month: 'Oct', score: 72 },
    { month: 'Nov', score: 75 },
    { month: 'Dec', score: 71 },
    { month: 'Jan', score: 78 },
    { month: 'Feb', score: stats?.avgScore ?? 80 },
  ];
  const maxTrendScore = 100;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Compliance</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Organization-wide compliance overview.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Compliance</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Organization-wide compliance overview.
        </p>
      </div>

      {/* Overall Score + Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Overall Score - Large */}
        <Card className={`border-2 ${stats ? scoreBgColor(stats.overallScore) : ''}`}>
          <CardContent className="flex flex-col items-center justify-center p-6">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Overall Score
            </p>
            <p className={`mt-1 text-4xl font-bold ${stats ? scoreColor(stats.overallScore) : ''}`}>
              {stats?.overallScore ?? '--'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Total Checks
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.totalChecks ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Pass Rate
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.passRate ?? 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Avg Score
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.avgScore ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Active Violations
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.activeViolations ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-type">By Type</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Recent Checks</CardTitle>
            </CardHeader>
            <CardContent>
              {recentChecks.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No compliance checks yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentChecks.map((check) => (
                    <a
                      key={check.id}
                      href={`/compliance/checks/${check.id}`}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {checkTypeLabels[check.check_type] ?? check.check_type}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {check.resource_name} &middot; {formatDate(check.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {check.score !== null && (
                          <span className={`text-sm font-semibold ${scoreColor(check.score)}`}>
                            {check.score}
                          </span>
                        )}
                        <Badge variant={statusBadgeVariant[check.status] ?? 'secondary'}>
                          {check.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Type Tab */}
        <TabsContent value="by-type">
          <div className="grid gap-4 sm:grid-cols-2">
            {typeBreakdowns.map((tb) => (
              <Card key={tb.type}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {checkTypeLabels[tb.type] ?? tb.type}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        Count
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
                        {tb.count}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        Avg Score
                      </p>
                      <p className={`mt-1 text-xl font-bold ${tb.avgScore > 0 ? scoreColor(tb.avgScore) : 'text-gray-400'}`}>
                        {tb.avgScore > 0 ? tb.avgScore : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        Pass Rate
                      </p>
                      <p className={`mt-1 text-xl font-bold ${tb.passRate > 0 ? scoreColor(tb.passRate) : 'text-gray-400'}`}>
                        {tb.passRate > 0 ? `${tb.passRate}%` : '--'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-gray-400" />
                <CardTitle>Score Trends</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Average compliance score over the past 6 months.
              </p>
              {/* Simple bar chart using divs */}
              <div className="flex items-end gap-3 h-48">
                {trendData.map((item) => (
                  <div key={item.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {item.score}
                    </span>
                    <div
                      className={`w-full rounded-t-md transition-all ${
                        item.score >= 80
                          ? 'bg-green-500'
                          : item.score >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ height: `${(item.score / maxTrendScore) * 100}%` }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.month}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
