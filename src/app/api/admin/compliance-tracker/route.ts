import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import type { ComplianceTrackerData } from '@/types/api';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { message: 'Authentication required', code: 'UNAUTHORIZED', statusCode: 401 } },
        { status: 401 }
      );
    }

    // Admin check: user must have admin or owner role in at least one org
    const { data: adminMembership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .in('role', ['admin', 'owner'])
      .is('deleted_at', null)
      .limit(1);

    if (!adminMembership || adminMembership.length === 0) {
      return NextResponse.json(
        { error: { message: 'Admin access required', code: 'FORBIDDEN', statusCode: 403 } },
        { status: 403 }
      );
    }

    // Compute month start
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartISO = monthStart.toISOString();

    // Parallel fetch all data sources
    const [docsResult, detectionsResult, aiResult, anomalyResult, errorsResult] =
      await Promise.all([
        supabase
          .from('documents')
          .select('id, file_type, created_at')
          .gte('created_at', monthStartISO)
          .is('deleted_at', null)
          .limit(10000),
        supabase
          .from('detection_results')
          .select('id, confidence_score, reviewed_by, created_at')
          .gte('created_at', monthStartISO)
          .limit(10000),
        supabase
          .from('ai_usage')
          .select('id, operation, cost_cents, status, created_at')
          .gte('created_at', monthStartISO)
          .limit(10000),
        supabase
          .from('anomaly_flags')
          .select('id, anomaly_type, severity, status, detected_at')
          .gte('detected_at', monthStartISO)
          .limit(10000),
        supabase
          .from('detection_errors')
          .select('id, error_type, resolved, created_at')
          .gte('created_at', monthStartISO)
          .limit(10000),
      ]);

    const docs = docsResult.data || [];
    const detections = detectionsResult.data || [];
    const aiRows = aiResult.data || [];
    const anomalies = anomalyResult.data || [];
    const errors = errorsResult.data || [];

    // ── Uploads aggregation ──
    const byFileType: Record<string, number> = {};
    for (const doc of docs) {
      const ft = doc.file_type || 'unknown';
      byFileType[ft] = (byFileType[ft] || 0) + 1;
    }

    // ── Detections aggregation ──
    let totalConfidence = 0;
    let reviewedCount = 0;
    const buckets = [
      { label: '0–0.5', min: 0, max: 0.5, count: 0 },
      { label: '0.5–0.7', min: 0.5, max: 0.7, count: 0 },
      { label: '0.7–0.85', min: 0.7, max: 0.85, count: 0 },
      { label: '0.85–1.0', min: 0.85, max: 1.01, count: 0 },
    ];
    for (const det of detections) {
      const score = Number(det.confidence_score) || 0;
      totalConfidence += score;
      if (det.reviewed_by) reviewedCount++;
      for (const b of buckets) {
        if (score >= b.min && score < b.max) {
          b.count++;
          break;
        }
      }
    }

    // ── AI calls aggregation ──
    let totalCostCents = 0;
    let aiErrorCount = 0;
    const byOperation: Record<string, { calls: number; costCents: number }> = {};
    for (const row of aiRows) {
      const cost = Number(row.cost_cents) || 0;
      totalCostCents += cost;
      if (row.status === 'error') aiErrorCount++;
      const op = row.operation || 'unknown';
      if (!byOperation[op]) byOperation[op] = { calls: 0, costCents: 0 };
      byOperation[op].calls++;
      byOperation[op].costCents += cost;
    }

    // ── Anomaly flags aggregation ──
    const byAnomalyType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let openCount = 0;
    for (const flag of anomalies) {
      const t = flag.anomaly_type || 'unknown';
      byAnomalyType[t] = (byAnomalyType[t] || 0) + 1;
      const s = flag.severity || 'medium';
      bySeverity[s] = (bySeverity[s] || 0) + 1;
      if (flag.status === 'open') openCount++;
    }

    // ── Detection errors aggregation ──
    const byErrorType: Record<string, number> = {};
    let resolvedCount = 0;
    for (const err of errors) {
      const et = err.error_type || 'unknown';
      byErrorType[et] = (byErrorType[et] || 0) + 1;
      if (err.resolved) resolvedCount++;
    }

    // ── Daily trends ──
    const dayMap = new Map<
      string,
      { uploads: number; aiCalls: number; guardrailTriggers: number }
    >();
    const ensureDay = (date: string) => {
      const day = date.substring(0, 10);
      if (!dayMap.has(day)) {
        dayMap.set(day, { uploads: 0, aiCalls: 0, guardrailTriggers: 0 });
      }
      return dayMap.get(day)!;
    };
    for (const doc of docs) {
      if (doc.created_at) ensureDay(doc.created_at).uploads++;
    }
    for (const row of aiRows) {
      if (row.created_at) ensureDay(row.created_at).aiCalls++;
    }
    for (const flag of anomalies) {
      if (flag.detected_at) ensureDay(flag.detected_at).guardrailTriggers++;
    }

    const dailyTrends = Array.from(dayMap.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result: ComplianceTrackerData = {
      uploads: {
        total: docs.length,
        byFileType,
      },
      detections: {
        total: detections.length,
        reviewed: reviewedCount,
        avgConfidence:
          detections.length > 0
            ? Math.round((totalConfidence / detections.length) * 100) / 100
            : 0,
        confidenceBuckets: buckets.map((b) => ({ label: b.label, count: b.count })),
      },
      aiCalls: {
        total: aiRows.length,
        totalCostCents,
        byOperation: Object.entries(byOperation).map(([operation, d]) => ({
          operation,
          calls: d.calls,
          costCents: d.costCents,
        })),
        errorCount: aiErrorCount,
      },
      guardrails: {
        total: anomalies.length,
        open: openCount,
        byType: byAnomalyType,
        bySeverity,
      },
      overrides: {
        total: errors.length,
        resolved: resolvedCount,
        byErrorType,
      },
      dailyTrends,
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/admin/compliance-tracker error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
