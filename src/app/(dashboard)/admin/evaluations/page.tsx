'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Target, Crosshair, Activity, ShieldCheck, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import type { EvaluationCaseResult, EvaluationReportResponse, RegressionGateResponse } from '@/types/api';
import type { GroundTruthDocument } from '@/types/database';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const RUN_TYPES = [
  { value: 'document_review', label: 'Document Review' },
  { value: 'fair_housing_check', label: 'Fair Housing Check' },
  { value: 'listing_compliance', label: 'Listing Compliance' },
];

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function EvaluationsPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  // Ground truth state
  const [groundTruths, setGroundTruths] = useState<GroundTruthDocument[]>([]);
  const [gtLoading, setGtLoading] = useState(true);
  const [gtTotal, setGtTotal] = useState(0);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDocType, setAddDocType] = useState('document_review');
  const [addInputText, setAddInputText] = useState('');
  const [addFindings, setAddFindings] = useState('');
  const [addTags, setAddTags] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Run evaluation state
  const [runType, setRunType] = useState('document_review');
  const [runTags, setRunTags] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<EvaluationReportResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Runs history state
  const [runs, setRuns] = useState<Array<{
    id: string;
    run_type: string;
    model: string;
    total_cases: number;
    passed: number;
    failed: number;
    precision_score: number | null;
    recall_score: number | null;
    f1_score: number | null;
    status: string;
    started_at: string;
    completed_at: string | null;
  }>>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  // Regression history state
  const [regressionHistory, setRegressionHistory] = useState<Array<{
    id: string;
    run_type: string;
    model: string;
    f1_score: number | null;
    precision_score: number | null;
    recall_score: number | null;
    previous_f1: number | null;
    f1_delta: number | null;
    triggered_by: string;
    status: string;
    notes: string | null;
    total_cases: number;
    passed: number;
    failed: number;
    completed_at: string | null;
    created_at: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Regression gate state
  const [gateLoading, setGateLoading] = useState(false);
  const [gateResult, setGateResult] = useState<RegressionGateResponse | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const orgId = currentOrg?.id;

  // Redirect non-admin
  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (orgId) h['x-org-id'] = orgId;
    return h;
  }, [orgId]);

  // Fetch ground truths
  const fetchGroundTruths = useCallback(async () => {
    if (!orgId) return;
    setGtLoading(true);
    try {
      const res = await fetch(`/api/evaluations/ground-truth?pageSize=50`, { headers: headers() });
      if (!res.ok) throw new Error('Failed to fetch ground truth documents');
      const json = await res.json();
      setGroundTruths(json.data ?? []);
      setGtTotal(json.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setGtLoading(false);
    }
  }, [orgId, headers]);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    if (!orgId) return;
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/evaluations/runs?pageSize=50`, { headers: headers() });
      if (!res.ok) throw new Error('Failed to fetch runs');
      const json = await res.json();
      setRuns(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setRunsLoading(false);
    }
  }, [orgId, headers]);

  // Fetch regression history
  const fetchHistory = useCallback(async () => {
    if (!orgId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/evaluations/regression-gate`, { headers: headers() });
      if (!res.ok) throw new Error('Failed to fetch regression history');
      const json = await res.json();
      setRegressionHistory(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setHistoryLoading(false);
    }
  }, [orgId, headers]);

  useEffect(() => {
    if ((isOwner || isAdmin) && orgId) {
      fetchGroundTruths();
      fetchRuns();
      fetchHistory();
    }
  }, [fetchGroundTruths, fetchRuns, fetchHistory, isOwner, isAdmin, orgId]);

  if (!isOwner && !isAdmin) return null;

  // Add ground truth handler
  const handleAddGroundTruth = async () => {
    setAddSubmitting(true);
    try {
      let parsedFindings;
      try {
        parsedFindings = JSON.parse(addFindings);
      } catch {
        setError('Invalid JSON in expected findings');
        setAddSubmitting(false);
        return;
      }

      const res = await fetch('/api/evaluations/ground-truth', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          document_type: addDocType,
          input_text: addInputText,
          expected_findings: parsedFindings,
          tags: addTags ? addTags.split(',').map((t) => t.trim()) : [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Failed to create');
      }
      setShowAddForm(false);
      setAddInputText('');
      setAddFindings('');
      setAddTags('');
      fetchGroundTruths();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setAddSubmitting(false);
    }
  };

  // Run evaluation handler
  const handleRunEvaluation = async () => {
    setRunLoading(true);
    setRunError(null);
    setRunResult(null);
    try {
      const res = await fetch('/api/evaluations/runs', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          run_type: runType,
          tags: runTags ? runTags.split(',').map((t) => t.trim()) : undefined,
          triggered_by: 'manual',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Evaluation failed');
      }
      const json = await res.json();
      setRunResult(json.data);
      fetchRuns(); // refresh history
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setRunLoading(false);
    }
  };

  // Regression gate handler
  const handleRunGate = async () => {
    setGateLoading(true);
    setGateError(null);
    setGateResult(null);
    try {
      const res = await fetch('/api/evaluations/regression-gate', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ triggered_by: 'manual' }),
      });
      const json = await res.json();
      if (res.status !== 200 && res.status !== 422) {
        throw new Error(json?.error?.message || 'Gate check failed');
      }
      setGateResult(json.data);
      fetchHistory();
      fetchRuns();
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Gate check failed');
    } finally {
      setGateLoading(false);
    }
  };

  // Latest completed run stats
  const latestRun = runs.find((r) => r.status === 'completed');

  const statCards = [
    {
      label: 'Latest F1',
      value: latestRun?.f1_score != null ? pct(latestRun.f1_score) : 'N/A',
      icon: Target,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Precision',
      value: latestRun?.precision_score != null ? pct(latestRun.precision_score) : 'N/A',
      icon: Crosshair,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Recall',
      value: latestRun?.recall_score != null ? pct(latestRun.recall_score) : 'N/A',
      icon: Activity,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Ground Truths',
      value: gtTotal.toString(),
      icon: FlaskConical,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
  ];

  // Chart data from completed runs
  const chartData = runs
    .filter((r) => r.status === 'completed' && r.completed_at)
    .reverse()
    .map((r) => ({
      date: r.completed_at ? new Date(r.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      precision: r.precision_score ?? 0,
      recall: r.recall_score ?? 0,
      f1: r.f1_score ?? 0,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Evaluations</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Measure AI accuracy by comparing results against labeled ground truth documents.
        </p>
      </div>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              {gtLoading || runsLoading ? (
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
      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="ground-truth">
            <TabsList>
              <TabsTrigger value="ground-truth">Ground Truth</TabsTrigger>
              <TabsTrigger value="run-evaluation">Run Evaluation</TabsTrigger>
              <TabsTrigger value="accuracy-report">Accuracy Report</TabsTrigger>
              <TabsTrigger value="regression-gate">Regression Gate</TabsTrigger>
            </TabsList>

            {/* Ground Truth Tab */}
            <TabsContent value="ground-truth">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Labeled Documents ({gtTotal})
                  </h3>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {showAddForm ? 'Cancel' : 'Add Ground Truth'}
                  </button>
                </div>

                {/* Add form */}
                {showAddForm && (
                  <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Document Type
                      </label>
                      <select
                        value={addDocType}
                        onChange={(e) => setAddDocType(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                      >
                        {RUN_TYPES.map((rt) => (
                          <option key={rt.value} value={rt.value}>{rt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Input Text
                      </label>
                      <textarea
                        value={addInputText}
                        onChange={(e) => setAddInputText(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        placeholder="Paste the document text..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Expected Findings (JSON array)
                      </label>
                      <textarea
                        value={addFindings}
                        onChange={(e) => setAddFindings(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-800"
                        placeholder='[{"type":"missing_clause","severity":"error","message":"..."}]'
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Tags (comma-separated)
                      </label>
                      <input
                        value={addTags}
                        onChange={(e) => setAddTags(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        placeholder="e.g. contract, california"
                      />
                    </div>
                    <button
                      onClick={handleAddGroundTruth}
                      disabled={addSubmitting || !addInputText || !addFindings}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {addSubmitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}

                {/* Table */}
                {gtLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : groundTruths.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No ground truth documents yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Tags</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Source</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Findings</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Active</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groundTruths.map((gt) => {
                          const findings = Array.isArray(gt.expected_findings) ? gt.expected_findings : [];
                          return (
                            <tr key={gt.id} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-medium">{gt.document_type}</td>
                              <td className="px-3 py-2">
                                {(gt.tags ?? []).map((t) => (
                                  <span key={t} className="mr-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">
                                    {t}
                                  </span>
                                ))}
                              </td>
                              <td className="px-3 py-2">{gt.source}</td>
                              <td className="px-3 py-2">{findings.length}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${gt.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                                  {gt.is_active ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500">
                                {new Date(gt.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Run Evaluation Tab */}
            <TabsContent value="run-evaluation">
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Run Type
                    </label>
                    <select
                      value={runType}
                      onChange={(e) => setRunType(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                    >
                      {RUN_TYPES.map((rt) => (
                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Tags (optional)
                    </label>
                    <input
                      value={runTags}
                      onChange={(e) => setRunTags(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                      placeholder="e.g. contract, california"
                    />
                  </div>
                  <button
                    onClick={handleRunEvaluation}
                    disabled={runLoading}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {runLoading ? 'Running...' : 'Run Evaluation'}
                  </button>
                </div>

                {runError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{runError}</p>
                )}

                {runResult && (
                  <div className="space-y-4">
                    <div className="flex gap-4 text-sm">
                      <span className="font-medium">Status: <span className="text-green-600">{runResult.status}</span></span>
                      <span>Cases: {runResult.total_cases}</span>
                      <span className="text-green-600">Passed: {runResult.passed}</span>
                      <span className="text-red-600">Failed: {runResult.failed}</span>
                      <span>F1: {pct(runResult.aggregate_f1)}</span>
                      <span>Precision: {pct(runResult.aggregate_precision)}</span>
                      <span>Recall: {pct(runResult.aggregate_recall)}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Doc ID</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Pass</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Expected</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Actual</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">TP</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">FP</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">FN</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">F1</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runResult.cases.map((c: EvaluationCaseResult) => (
                            <tr key={c.ground_truth_id} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-mono text-xs">{c.ground_truth_id.slice(0, 8)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                  {c.passed ? 'PASS' : 'FAIL'}
                                </span>
                              </td>
                              <td className="px-3 py-2">{c.expected_count}</td>
                              <td className="px-3 py-2">{c.actual_count}</td>
                              <td className="px-3 py-2">{c.true_positives}</td>
                              <td className="px-3 py-2">{c.false_positives}</td>
                              <td className="px-3 py-2">{c.false_negatives}</td>
                              <td className="px-3 py-2">{pct(c.f1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Accuracy Report Tab */}
            <TabsContent value="accuracy-report">
              <div className="space-y-6">
                {/* Chart */}
                {chartData.length > 0 ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                        <Tooltip formatter={(value) => [`${(Number(value ?? 0) * 100).toFixed(1)}%`]} />
                        <Legend />
                        <Line type="monotone" dataKey="precision" name="Precision" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="recall" name="Recall" stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="f1" name="F1 Score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="flex h-40 items-center justify-center text-sm text-gray-500">
                    No completed runs yet. Run an evaluation to see accuracy trends.
                  </p>
                )}

                {/* Recent runs table */}
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Runs</h3>
                {runsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : runs.length === 0 ? (
                  <p className="text-sm text-gray-500">No evaluation runs yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Model</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Cases</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Pass/Fail</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">F1</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2 font-medium">{r.run_type}</td>
                            <td className="px-3 py-2 text-xs font-mono">{r.model}</td>
                            <td className="px-3 py-2">{r.total_cases}</td>
                            <td className="px-3 py-2">
                              <span className="text-green-600">{r.passed}</span>
                              {' / '}
                              <span className="text-red-600">{r.failed}</span>
                            </td>
                            <td className="px-3 py-2">{r.f1_score != null ? pct(r.f1_score) : '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                r.status === 'completed'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : r.status === 'running'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* Regression Gate Tab */}
            <TabsContent value="regression-gate">
              <div className="space-y-6">
                {/* Gate trigger */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleRunGate}
                    disabled={gateLoading}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {gateLoading ? 'Running Gate Check...' : 'Run Regression Gate'}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Runs all detection types against the full labeled dataset and blocks if accuracy drops.
                  </p>
                </div>

                {gateError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{gateError}</p>
                )}

                {/* Gate result */}
                {gateResult && (
                  <div className="rounded-lg border p-4 space-y-4" style={{
                    borderColor: gateResult.gate_passed ? '#22c55e' : '#ef4444',
                  }}>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${
                        gateResult.gate_passed
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                        <ShieldCheck className="h-4 w-4" />
                        {gateResult.gate_passed ? 'GATE PASSED' : 'GATE BLOCKED'}
                      </span>
                      <span className="text-xs text-gray-500">
                        Threshold: {(gateResult.f1_drop_threshold * 100).toFixed(0)}pp drop | Min F1: {(gateResult.min_f1 * 100).toFixed(0)}%
                      </span>
                    </div>

                    {gateResult.block_reasons.length > 0 && (
                      <div className="rounded bg-red-50 p-3 dark:bg-red-900/10">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Block Reasons:</p>
                        {gateResult.block_reasons.map((reason, i) => (
                          <p key={i} className="text-sm text-red-600 dark:text-red-400">- {reason}</p>
                        ))}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">F1</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Delta</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Precision</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Recall</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Cases</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Gate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gateResult.results.map((r) => (
                            <tr key={r.run_type} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-medium">{r.run_type}</td>
                              <td className="px-3 py-2">{pct(r.current_f1)}</td>
                              <td className="px-3 py-2">
                                {r.f1_delta !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 ${r.f1_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {r.f1_delta >= 0
                                      ? <ArrowUpRight className="h-3 w-3" />
                                      : <ArrowDownRight className="h-3 w-3" />}
                                    {(Math.abs(r.f1_delta) * 100).toFixed(1)}pp
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">{pct(r.current_precision)}</td>
                              <td className="px-3 py-2">{pct(r.current_recall)}</td>
                              <td className="px-3 py-2">{r.passed}/{r.total_cases}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.gate_passed
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {r.gate_passed ? 'PASS' : 'BLOCK'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Regression History */}
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Regression History</h3>
                {historyLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : regressionHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No regression history yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">F1</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Delta</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Cases</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Trigger</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Gate</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regressionHistory.map((r) => {
                          const isGatePass = r.notes?.includes('PASSED') ?? false;
                          const isGateBlock = r.notes?.includes('BLOCKED') ?? false;
                          return (
                            <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-medium">{r.run_type}</td>
                              <td className="px-3 py-2">{r.f1_score != null ? pct(r.f1_score) : '-'}</td>
                              <td className="px-3 py-2">
                                {r.f1_delta !== null ? (
                                  <span className={`inline-flex items-center gap-0.5 ${r.f1_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {r.f1_delta >= 0
                                      ? <ArrowUpRight className="h-3 w-3" />
                                      : <ArrowDownRight className="h-3 w-3" />}
                                    {(Math.abs(r.f1_delta) * 100).toFixed(1)}pp
                                  </span>
                                ) : (
                                  <span className="text-gray-400">first run</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-green-600">{r.passed}</span>
                                {'/'}
                                <span>{r.total_cases}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.triggered_by === 'ci' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                                    : r.triggered_by === 'deploy' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}>
                                  {r.triggered_by}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.status === 'completed'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : r.status === 'running'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {isGatePass ? (
                                  <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">PASS</span>
                                ) : isGateBlock ? (
                                  <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">BLOCK</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-500">
                                {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
