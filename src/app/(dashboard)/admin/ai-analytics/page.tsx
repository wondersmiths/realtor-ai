'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Activity, Database, Clock } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';

interface AIAnalyticsData {
  totalSpendCents: number;
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  errorCount: number;
  spendByOrg: Array<{ orgId: string; orgName: string; spendCents: number; requests: number }>;
  spendByOperation: Array<{ operation: string; spendCents: number; requests: number; avgLatencyMs: number }>;
  dailyTrends: Array<{ date: string; inputTokens: number; outputTokens: number; requests: number; spendCents: number }>;
  cacheStats: { totalRequests: number; cacheHits: number; hitRate: number };
  creditUsage: Array<{ orgId: string; orgName: string; usedCredits: number; maxCredits: number; pct: number }>;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatOperation(op: string): string {
  return op
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function AIAnalyticsPage() {
  const router = useRouter();
  useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  const [data, setData] = useState<AIAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect non-admin users
  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-analytics');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Request failed (${res.status})`);
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error('Error fetching AI analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchData();
    }
  }, [fetchData, isOwner, isAdmin]);

  if (!isOwner && !isAdmin) {
    return null;
  }

  const statCards = [
    {
      label: 'Total Spend',
      value: data ? formatCents(data.totalSpendCents) : '$0.00',
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Total Requests',
      value: data?.totalRequests?.toLocaleString() ?? '0',
      icon: Activity,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Cache Hit Rate',
      value: data ? `${data.cacheStats.hitRate}%` : '0%',
      icon: Database,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Avg Latency',
      value: data ? `${data.avgLatencyMs}ms` : '0ms',
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
  ];

  // Prepare chart data
  const trendData = (data?.dailyTrends || []).map((d) => ({
    ...d,
    dateLabel: d.date.substring(5), // MM-DD
  }));

  const orgChartData = (data?.spendByOrg || []).slice(0, 15).map((d) => ({
    ...d,
    spendDollars: d.spendCents / 100,
  }));

  const opChartData = (data?.spendByOperation || []).map((d) => ({
    ...d,
    label: formatOperation(d.operation),
    spendDollars: d.spendCents / 100,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">AI Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          System-wide AI usage and cost metrics for the current month.
        </p>
      </div>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      {stat.label}
                    </p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-gray-50">
                    {stat.value}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts in Tabs */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      ) : data && (
        <Card>
          <CardContent className="p-6">
            <Tabs defaultValue="trends">
              <TabsList>
                <TabsTrigger value="trends">Token Trends</TabsTrigger>
                <TabsTrigger value="org">Spend by Org</TabsTrigger>
                <TabsTrigger value="feature">Spend by Feature</TabsTrigger>
                <TabsTrigger value="credits">Credit Usage</TabsTrigger>
              </TabsList>

              {/* Token Trends */}
              <TabsContent value="trends">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dateLabel" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="inputTokens"
                        name="Input Tokens"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="outputTokens"
                        name="Output Tokens"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              {/* Spend by Org */}
              <TabsContent value="org">
                <div className="h-80">
                  {orgChartData.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-gray-500">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={orgChartData} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" fontSize={12} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                        <YAxis type="category" dataKey="orgName" fontSize={12} width={80} />
                        <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Spend']} />
                        <Bar dataKey="spendDollars" name="Spend ($)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </TabsContent>

              {/* Spend by Feature */}
              <TabsContent value="feature">
                <div className="h-80">
                  {opChartData.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-gray-500">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={opChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Spend']} />
                        <Bar dataKey="spendDollars" name="Spend ($)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </TabsContent>

              {/* Credit Usage */}
              <TabsContent value="credits">
                <div className="space-y-4 py-4">
                  {(data.creditUsage || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No credit data available</p>
                  ) : (
                    data.creditUsage.map((cu) => (
                      <div key={cu.orgId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{cu.orgName}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              cu.pct > 80
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : cu.pct > 50
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}
                          >
                            {cu.pct}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cu.pct > 80
                                ? 'bg-red-500'
                                : cu.pct > 50
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(cu.pct, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {cu.usedCredits} / {cu.maxCredits} credits
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
