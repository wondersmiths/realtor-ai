'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';

interface AnomalyFlag {
  id: string;
  organization_id: string;
  anomaly_type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  detected_at: string;
  dismissed_at: string | null;
  resolved_at: string | null;
  organization?: { id: string; name: string; slug: string } | null;
}

interface Summary {
  open: number;
  dismissed: number;
  resolved: number;
  by_type: Record<string, number>;
}

interface AnomalyData {
  data: AnomalyFlag[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: Summary;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function formatType(t: string): string {
  return t.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnomalyFlagsPage() {
  const router = useRouter();
  useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  const [data, setData] = useState<AnomalyData | null>(null);
  const [historyData, setHistoryData] = useState<AnomalyFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [openRes, historyRes] = await Promise.all([
        fetch('/api/admin/anomaly-flags?status=open&pageSize=50'),
        fetch('/api/admin/anomaly-flags?pageSize=50'),
      ]);

      if (!openRes.ok) {
        const body = await openRes.json().catch(() => null);
        throw new Error(body?.error?.message || `Request failed (${openRes.status})`);
      }

      const openJson = await openRes.json();
      setData(openJson);

      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        setHistoryData(
          (historyJson.data || []).filter(
            (f: AnomalyFlag) => f.status === 'dismissed' || f.status === 'resolved',
          ),
        );
      }
    } catch (err) {
      console.error('Error fetching anomaly flags:', err);
      setError(err instanceof Error ? err.message : 'Failed to load anomaly flags');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchData();
    }
  }, [fetchData, isOwner, isAdmin]);

  const handleAction = async (flagId: string, status: 'dismissed' | 'resolved') => {
    setActionLoading(flagId);
    try {
      const res = await fetch(`/api/admin/anomaly-flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Action failed');
      }
      await fetchData();
    } catch (err) {
      console.error('Error updating flag:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOwner && !isAdmin) {
    return null;
  }

  const summary = data?.summary || { open: 0, dismissed: 0, resolved: 0, by_type: {} };
  const thisMonthTotal = (data?.pagination?.total || 0) + historyData.length;

  const statCards = [
    {
      label: 'Open Flags',
      value: summary.open,
      icon: ShieldAlert,
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'This Month',
      value: thisMonthTotal,
      icon: AlertTriangle,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Dismissed',
      value: summary.dismissed,
      icon: XCircle,
      color: 'text-gray-500',
      bg: 'bg-gray-50 dark:bg-gray-900/20',
    },
    {
      label: 'Resolved',
      value: summary.resolved,
      icon: CheckCircle,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
  ];

  // Chart data: by type
  const byTypeData = Object.entries(summary.by_type).map(([type, count]) => ({
    type: formatType(type),
    count,
  }));

  // Chart data: timeline (group by day)
  const allFlags = [...(data?.data || []), ...historyData];
  const dayMap = new Map<string, number>();
  for (const flag of allFlags) {
    const day = flag.detected_at.substring(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }
  const timelineData = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, dateLabel: date.substring(5), count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Anomaly Flags</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Monitor and manage abnormal behavior detected across organizations.
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

      {/* Stat Cards */}
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

      {/* Tabs */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <Tabs defaultValue="active">
              <TabsList>
                <TabsTrigger value="active">Active Flags</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="by-type">By Type</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              {/* Active Flags */}
              <TabsContent value="active">
                {(data?.data || []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No active anomaly flags</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500 dark:text-gray-400">
                          <th className="pb-2 pr-4 font-medium">Severity</th>
                          <th className="pb-2 pr-4 font-medium">Type</th>
                          <th className="pb-2 pr-4 font-medium">Organization</th>
                          <th className="pb-2 pr-4 font-medium">Description</th>
                          <th className="pb-2 pr-4 font-medium">Detected</th>
                          <th className="pb-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.data || []).map((flag) => (
                          <tr key={flag.id} className="border-b last:border-0">
                            <td className="py-3 pr-4">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.medium}`}>
                                {flag.severity}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                              {formatType(flag.anomaly_type)}
                            </td>
                            <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                              {flag.organization?.name || flag.organization_id.substring(0, 8)}
                            </td>
                            <td className="py-3 pr-4 max-w-xs truncate text-gray-600 dark:text-gray-400">
                              {flag.description || flag.title}
                            </td>
                            <td className="py-3 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {formatDate(flag.detected_at)}
                            </td>
                            <td className="py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAction(flag.id, 'dismissed')}
                                  disabled={actionLoading === flag.id}
                                  className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  Dismiss
                                </button>
                                <button
                                  onClick={() => handleAction(flag.id, 'resolved')}
                                  disabled={actionLoading === flag.id}
                                  className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                                >
                                  Resolve
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* History */}
              <TabsContent value="history">
                {historyData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No historical flags</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500 dark:text-gray-400">
                          <th className="pb-2 pr-4 font-medium">Status</th>
                          <th className="pb-2 pr-4 font-medium">Severity</th>
                          <th className="pb-2 pr-4 font-medium">Type</th>
                          <th className="pb-2 pr-4 font-medium">Organization</th>
                          <th className="pb-2 pr-4 font-medium">Title</th>
                          <th className="pb-2 font-medium">Detected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map((flag) => (
                          <tr key={flag.id} className="border-b last:border-0">
                            <td className="py-3 pr-4">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                flag.status === 'resolved'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {flag.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.medium}`}>
                                {flag.severity}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                              {formatType(flag.anomaly_type)}
                            </td>
                            <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                              {flag.organization?.name || flag.organization_id.substring(0, 8)}
                            </td>
                            <td className="py-3 pr-4 max-w-xs truncate text-gray-600 dark:text-gray-400">
                              {flag.title}
                            </td>
                            <td className="py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {formatDate(flag.detected_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* By Type Chart */}
              <TabsContent value="by-type">
                <div className="h-80">
                  {byTypeData.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-gray-500">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byTypeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="type" fontSize={12} />
                        <YAxis fontSize={12} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" name="Flags" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </TabsContent>

              {/* Timeline Chart */}
              <TabsContent value="timeline">
                <div className="h-80">
                  {timelineData.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-gray-500">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" fontSize={12} />
                        <YAxis fontSize={12} allowDecimals={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Flags"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={true}
                        />
                      </LineChart>
                    </ResponsiveContainer>
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
