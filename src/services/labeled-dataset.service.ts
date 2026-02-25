import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { ComplianceCheckFindingJSON, GroundTruthDocument } from '@/types/database';
import type {
  CreateGroundTruthRequest,
  UpdateGroundTruthRequest,
  RunEvaluationRequest,
  EvaluationCaseResult,
  EvaluationReportResponse,
} from '@/types/api';
import type { GroundTruthWithCreator, FairHousingViolation } from '@/types/domain';
import { AIService } from '@/services/ai.service';

// ──────────────────────────────────────────────
// Comparison helpers
// ──────────────────────────────────────────────

function normalize(s: string | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

interface ComparisonMetrics {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
  f1: number;
}

function compareFindings(
  expected: ComplianceCheckFindingJSON[],
  actual: ComplianceCheckFindingJSON[],
): ComparisonMetrics {
  const matchedExpected = new Set<number>();
  const matchedActual = new Set<number>();

  // Pass 1: exact match by rule_id
  for (let ai = 0; ai < actual.length; ai++) {
    if (!actual[ai].rule_id) continue;
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      if (actual[ai].rule_id === expected[ei].rule_id) {
        matchedActual.add(ai);
        matchedExpected.add(ei);
        break;
      }
    }
  }

  // Pass 2: match by type + fuzzy location
  for (let ai = 0; ai < actual.length; ai++) {
    if (matchedActual.has(ai)) continue;
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      if (actual[ai].type !== expected[ei].type) continue;
      const aLoc = normalize(actual[ai].location);
      const eLoc = normalize(expected[ei].location);
      if (aLoc && eLoc && (aLoc.includes(eLoc) || eLoc.includes(aLoc))) {
        matchedActual.add(ai);
        matchedExpected.add(ei);
        break;
      }
    }
  }

  const tp = matchedActual.size;
  const fp = actual.length - tp;
  const fn = expected.length - matchedExpected.size;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { true_positives: tp, false_positives: fp, false_negatives: fn, precision, recall, f1 };
}

// ──────────────────────────────────────────────
// AI routing
// ──────────────────────────────────────────────

const SEVERITY_MAP: Record<string, ComplianceCheckFindingJSON['severity']> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'critical',
};

async function executeAIForDocType(
  aiService: AIService,
  orgId: string,
  userId: string,
  docType: string,
  text: string,
): Promise<ComplianceCheckFindingJSON[]> {
  if (docType === 'fair_housing_check') {
    const result = await aiService.checkFairHousing(orgId, userId, text);
    return (result.data.violations || []).map((v: FairHousingViolation) => ({
      type: v.category,
      severity: SEVERITY_MAP[v.severity] ?? 'warning',
      message: v.explanation,
      location: v.text,
      suggestion: v.suggestion,
    }));
  }

  // document_review or default
  const result = await aiService.reviewDocument(orgId, userId, text);
  return result.data.findings || [];
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class LabeledDatasetService {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── CRUD ──────────────────────────────────────

  async createGroundTruth(
    orgId: string,
    userId: string,
    req: CreateGroundTruthRequest,
  ): Promise<GroundTruthDocument> {
    const { data, error } = await this.supabase
      .from('ground_truth_documents')
      .insert({
        organization_id: orgId,
        document_type: req.document_type,
        input_text: req.input_text,
        expected_findings: req.expected_findings,
        tags: req.tags ?? [],
        source: req.source ?? 'manual',
        is_active: true,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as GroundTruthDocument;
  }

  async listGroundTruth(
    orgId: string,
    filters: {
      page?: number;
      pageSize?: number;
      document_type?: string;
      is_active?: boolean;
    } = {},
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('ground_truth_documents')
      .select('*', { count: 'exact' })
      .or(`organization_id.eq.${orgId},organization_id.is.null`);

    if (filters.document_type) {
      query = query.eq('document_type', filters.document_type);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: (data ?? []) as GroundTruthDocument[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    };
  }

  async getGroundTruthById(id: string): Promise<GroundTruthWithCreator | null> {
    const { data, error } = await this.supabase
      .from('ground_truth_documents')
      .select('*, creator:profiles!ground_truth_documents_created_by_fkey(id, email, full_name)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as GroundTruthWithCreator;
  }

  async updateGroundTruth(id: string, req: UpdateGroundTruthRequest): Promise<GroundTruthDocument> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (req.document_type !== undefined) updates.document_type = req.document_type;
    if (req.input_text !== undefined) updates.input_text = req.input_text;
    if (req.expected_findings !== undefined) updates.expected_findings = req.expected_findings;
    if (req.tags !== undefined) updates.tags = req.tags;
    if (req.is_active !== undefined) updates.is_active = req.is_active;

    const { data, error } = await this.supabase
      .from('ground_truth_documents')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as GroundTruthDocument;
  }

  async deleteGroundTruth(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('ground_truth_documents')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // ── Evaluation ────────────────────────────────

  async runEvaluation(
    orgId: string,
    userId: string,
    req: RunEvaluationRequest,
  ): Promise<EvaluationReportResponse> {
    // 1. Fetch active ground truth docs
    let gtQuery = this.supabase
      .from('ground_truth_documents')
      .select('*')
      .eq('document_type', req.run_type)
      .eq('is_active', true)
      .or(`organization_id.eq.${orgId},organization_id.is.null`);

    if (req.tags && req.tags.length > 0) {
      gtQuery = gtQuery.overlaps('tags', req.tags);
    }

    const { data: groundTruthDocs, error: gtError } = await gtQuery;
    if (gtError) throw gtError;

    const docs = (groundTruthDocs ?? []) as GroundTruthDocument[];
    if (docs.length === 0) {
      throw new Error('No active ground truth documents found for this run type');
    }

    const modelUsed = process.env.AI_MODEL_STANDARD || 'claude-sonnet-4-20250514';

    // 2. Create regression run
    const { data: run, error: runError } = await this.supabase
      .from('regression_runs')
      .insert({
        run_type: req.run_type,
        model: modelUsed,
        total_cases: docs.length,
        passed: 0,
        failed: 0,
        precision_score: null,
        recall_score: null,
        f1_score: null,
        results_detail: [],
        triggered_by: req.triggered_by ?? 'manual',
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (runError) throw runError;

    const aiService = new AIService(this.supabase);
    const cases: EvaluationCaseResult[] = [];
    let totalPassed = 0;
    let totalFailed = 0;

    // 3. Evaluate each document
    for (const doc of docs) {
      try {
        const expectedFindings = (doc.expected_findings as unknown as ComplianceCheckFindingJSON[]) ?? [];
        const actualFindings = await executeAIForDocType(aiService, orgId, userId, req.run_type, doc.input_text);
        const metrics = compareFindings(expectedFindings, actualFindings);
        const passed = metrics.false_positives === 0 && metrics.false_negatives === 0;

        if (passed) totalPassed++;
        else totalFailed++;

        cases.push({
          ground_truth_id: doc.id,
          document_type: doc.document_type,
          passed,
          expected_count: expectedFindings.length,
          actual_count: actualFindings.length,
          true_positives: metrics.true_positives,
          false_positives: metrics.false_positives,
          false_negatives: metrics.false_negatives,
          precision: Math.round(metrics.precision * 1000) / 1000,
          recall: Math.round(metrics.recall * 1000) / 1000,
          f1: Math.round(metrics.f1 * 1000) / 1000,
        });
      } catch (err) {
        totalFailed++;
        cases.push({
          ground_truth_id: doc.id,
          document_type: doc.document_type,
          passed: false,
          expected_count: 0,
          actual_count: 0,
          true_positives: 0,
          false_positives: 0,
          false_negatives: 0,
          precision: 0,
          recall: 0,
          f1: 0,
        });
        console.error(`[LabeledDatasetService] Error evaluating doc ${doc.id}:`, err);
      }
    }

    // 4. Compute aggregate metrics
    const aggTP = cases.reduce((s, c) => s + c.true_positives, 0);
    const aggFP = cases.reduce((s, c) => s + c.false_positives, 0);
    const aggFN = cases.reduce((s, c) => s + c.false_negatives, 0);
    const aggPrecision = aggTP + aggFP > 0 ? aggTP / (aggTP + aggFP) : 0;
    const aggRecall = aggTP + aggFN > 0 ? aggTP / (aggTP + aggFN) : 0;
    const aggF1 = aggPrecision + aggRecall > 0 ? (2 * aggPrecision * aggRecall) / (aggPrecision + aggRecall) : 0;

    // 5. Update run
    const completedAt = new Date().toISOString();
    await this.supabase
      .from('regression_runs')
      .update({
        passed: totalPassed,
        failed: totalFailed,
        precision_score: Math.round(aggPrecision * 1000) / 1000,
        recall_score: Math.round(aggRecall * 1000) / 1000,
        f1_score: Math.round(aggF1 * 1000) / 1000,
        results_detail: cases,
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', run.id);

    return {
      run_id: run.id,
      run_type: req.run_type,
      model: modelUsed,
      status: 'completed',
      total_cases: docs.length,
      passed: totalPassed,
      failed: totalFailed,
      aggregate_precision: Math.round(aggPrecision * 1000) / 1000,
      aggregate_recall: Math.round(aggRecall * 1000) / 1000,
      aggregate_f1: Math.round(aggF1 * 1000) / 1000,
      cases,
      started_at: run.started_at,
      completed_at: completedAt,
    };
  }

  // ── Run queries ───────────────────────────────

  async getRunById(id: string): Promise<EvaluationReportResponse | null> {
    const { data, error } = await this.supabase
      .from('regression_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    const run = data;
    const cases = (run.results_detail ?? []) as EvaluationCaseResult[];

    return {
      run_id: run.id,
      run_type: run.run_type,
      model: run.model,
      status: run.status,
      total_cases: run.total_cases,
      passed: run.passed,
      failed: run.failed,
      aggregate_precision: run.precision_score ?? 0,
      aggregate_recall: run.recall_score ?? 0,
      aggregate_f1: run.f1_score ?? 0,
      cases,
      started_at: run.started_at,
      completed_at: run.completed_at,
    };
  }

  async listRuns(
    filters: {
      page?: number;
      pageSize?: number;
      run_type?: string;
      status?: string;
    } = {},
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('regression_runs')
      .select('id, run_type, model, total_cases, passed, failed, precision_score, recall_score, f1_score, triggered_by, status, started_at, completed_at, created_at', { count: 'exact' });

    if (filters.run_type) {
      query = query.eq('run_type', filters.run_type);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: data ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    };
  }
}
