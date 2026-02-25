'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  ScanSearch,
  Target,
  BrainCircuit,
  ShieldAlert,
  PenTool,
  Download,
  FileText,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import { exportCSV, exportPDF } from '@/lib/export';
import type { ComplianceTrackerData } from '@/types/api';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ComplianceTrackerPage() {
  const router = useRouter();
  useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  const [data, setData] = useState<ComplianceTrackerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/compliance-tracker');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Request failed (${res.status})`);
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error('Error fetching compliance tracker:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchData();
    }
  }, [fetchData, isOwner, isAdmin]);

  if (!isOwner && !isAdmin) return null;

  // ── Export helpers ──
  const buildExportRows = (): { headers: string[]; rows: string[][] } => {
    if (!data) return { headers: [], rows: [] };
    const headers = ['Date', 'Uploads', 'AI Calls', 'Guardrail Triggers'];
    const rows = data.dailyTrends.map((d) => [
      d.date,
      String(d.uploads),
      String(d.aiCalls),
      String(d.guardrailTriggers),
    ]);
    return { headers, rows };
  };

  const handleExportCSV = () => {
    const { headers, rows } = buildExportRows();
    exportCSV(headers, rows, `compliance-tracker-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportPDF = () => {
    const { headers, rows } = buildExportRows();
    exportPDF(
      'Compliance Tracker Report',
      headers,
      rows,
      `compliance-tracker-${new Date().toISOString().split('T')[0]}.pdf`
    );
  };

  // ── Stat cards ──
  const statCards = [
    {
      label: 'Uploads',
      value: data?.uploads.total.toLocaleString() ?? '0',
      icon: Upload,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Detections',
      value: data?.detections.total.toLocaleString() ?? '0',
      icon: ScanSearch,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
    {
      label: 'Avg Confidence',
      value: data ? `${(data.detections.avgConfidence * 100).toFixed(1)}%` : '0%',
      icon: Target,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'AI Calls',
      value: data?.aiCalls.total.toLocaleString() ?? '0',
      icon: BrainCircuit,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Guardrail Triggers',
      value: data?.guardrails.total.toLocaleString() ?? '0',
      icon: ShieldAlert,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      label: 'Manual Overrides',
      value: data?.overrides.total.toLocaleString() ?? '0',
      icon: PenTool,
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  // ── Chart data ──
  const trendData = (data?.dailyTrends || []).map((d) => ({
    ...d,
    dateLabel: d.date.substring(5),
  }));

  const confidenceData = data?.detections.confidenceBuckets || [];

  const opData = (data?.aiCalls.byOperation || []).map((d) => ({
    ...d,
    label: formatLabel(d.operation),
    costDollars: d.costCents / 100,
  }));

  const anomalyTypeData = Object.entries(data?.guardrails.byType || {}).map(
    ([type, count]) => ({ type: formatLabel(type), count })
  );

  const severityData = Object.entries(data?.guardrails.bySeverity || {}).map(
    ([severity, count]) => ({ severity: formatLabel(severity), count })
  );

  const overrideData = Object.entries(data?.overrides.byErrorType || {}).map(
    ([errorType, count]) => ({ errorType: formatLabel(errorType), count })
  );

  const fileTypeData = Object.entries(data?.uploads.byFileType || {}).map(
    ([fileType, count]) => ({ fileType, count })
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Compliance Tracker
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Unified compliance activity dashboard for the current month.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={!data}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={!data}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}
                    >
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
        data && (
          <Card>
            <CardContent className="p-6">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="uploads">Uploads</TabsTrigger>
                  <TabsTrigger value="detections">Detections</TabsTrigger>
                  <TabsTrigger value="ai-calls">AI Calls</TabsTrigger>
                  <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
                  <TabsTrigger value="overrides">Overrides</TabsTrigger>
                </TabsList>

                {/* Overview — daily trend lines */}
                <TabsContent value="overview">
                  <div className="h-80">
                    {trendData.length === 0 ? (
                      <p className="flex h-full items-center justify-center text-sm text-gray-500">
                        No data available
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dateLabel" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="uploads"
                            name="Uploads"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="aiCalls"
                            name="AI Calls"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="guardrailTriggers"
                            name="Guardrail Triggers"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </TabsContent>

                {/* Uploads — file type breakdown */}
                <TabsContent value="uploads">
                  <div className="h-80">
                    {fileTypeData.length === 0 ? (
                      <p className="flex h-full items-center justify-center text-sm text-gray-500">
                        No upload data available
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fileTypeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="fileType" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Bar
                            dataKey="count"
                            name="Uploads"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </TabsContent>

                {/* Detections — confidence distribution */}
                <TabsContent value="detections">
                  <div className="space-y-4">
                    <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Reviewed:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {data.detections.reviewed} / {data.detections.total}
                        </strong>
                      </span>
                      <span>
                        Avg Confidence:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {(data.detections.avgConfidence * 100).toFixed(1)}%
                        </strong>
                      </span>
                    </div>
                    <div className="h-72">
                      {confidenceData.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-gray-500">
                          No detection data available
                        </p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={confidenceData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar
                              dataKey="count"
                              name="Detections"
                              fill="#6366f1"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* AI Calls — cost + calls by operation */}
                <TabsContent value="ai-calls">
                  <div className="space-y-4">
                    <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Total Cost:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {formatCents(data.aiCalls.totalCostCents)}
                        </strong>
                      </span>
                      <span>
                        Errors:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {data.aiCalls.errorCount}
                        </strong>
                      </span>
                    </div>
                    <div className="h-72">
                      {opData.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-gray-500">
                          No AI call data available
                        </p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={opData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={12} />
                            <YAxis
                              yAxisId="left"
                              fontSize={12}
                              orientation="left"
                            />
                            <YAxis
                              yAxisId="right"
                              fontSize={12}
                              orientation="right"
                              tickFormatter={(v: number) =>
                                `$${v.toFixed(2)}`
                              }
                            />
                            <Tooltip />
                            <Legend />
                            <Bar
                              yAxisId="left"
                              dataKey="calls"
                              name="Calls"
                              fill="#8b5cf6"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              yAxisId="right"
                              dataKey="costDollars"
                              name="Cost ($)"
                              fill="#3b82f6"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Guardrails — by type and severity */}
                <TabsContent value="guardrails">
                  <div className="space-y-4">
                    <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Open:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {data.guardrails.open}
                        </strong>
                      </span>
                      <span>
                        Total:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {data.guardrails.total}
                        </strong>
                      </span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          By Type
                        </h3>
                        <div className="h-64">
                          {anomalyTypeData.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-gray-500">
                              No data
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={anomalyTypeData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="type" fontSize={11} />
                                <YAxis fontSize={12} />
                                <Tooltip />
                                <Bar
                                  dataKey="count"
                                  name="Flags"
                                  fill="#f97316"
                                  radius={[4, 4, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          By Severity
                        </h3>
                        <div className="h-64">
                          {severityData.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-gray-500">
                              No data
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={severityData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="severity" fontSize={12} />
                                <YAxis fontSize={12} />
                                <Tooltip />
                                <Bar
                                  dataKey="count"
                                  name="Flags"
                                  fill="#ef4444"
                                  radius={[4, 4, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Overrides — by error type */}
                <TabsContent value="overrides">
                  <div className="space-y-4">
                    <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Resolved:{' '}
                        <strong className="text-gray-900 dark:text-gray-50">
                          {data.overrides.resolved} / {data.overrides.total}
                        </strong>
                      </span>
                    </div>
                    <div className="h-72">
                      {overrideData.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-gray-500">
                          No override data available
                        </p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={overrideData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="errorType" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Bar
                              dataKey="count"
                              name="Overrides"
                              fill="#ef4444"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
