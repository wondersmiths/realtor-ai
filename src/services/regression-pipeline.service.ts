import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import { LabeledDatasetService } from '@/services/labeled-dataset.service';
import type {
  RegressionGateRequest,
  RegressionGateResponse,
  RegressionTypeResult,
  EvaluationReportResponse,
} from '@/types/api';

// ──────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────

const DEFAULT_F1_DROP_THRESHOLD = 0.05;
const DEFAULT_MIN_F1 = 0.7;
const ALL_RUN_TYPES = ['document_review', 'fair_housing_check', 'listing_compliance'];

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class RegressionPipelineService {
  private readonly labeledDataset: LabeledDatasetService;

  constructor(private readonly supabase: SupabaseClient) {
    this.labeledDataset = new LabeledDatasetService(supabase);
  }

  /**
   * Run the full regression gate: execute evaluations across all detection
   * types, compare against previous results, and return a pass/fail verdict.
   */
  async runGate(
    orgId: string,
    userId: string,
    req: RegressionGateRequest,
  ): Promise<RegressionGateResponse> {
    const startedAt = new Date().toISOString();
    const f1DropThreshold = req.f1_drop_threshold ?? DEFAULT_F1_DROP_THRESHOLD;
    const minF1 = req.min_f1 ?? DEFAULT_MIN_F1;
    const runTypes = req.run_types && req.run_types.length > 0
      ? req.run_types
      : await this.getActiveRunTypes(orgId);

    const results: RegressionTypeResult[] = [];
    const blockReasons: string[] = [];

    for (const runType of runTypes) {
      const typeResult = await this.evaluateType(
        orgId,
        userId,
        runType,
        req,
        f1DropThreshold,
        minF1,
      );
      results.push(typeResult);

      if (!typeResult.gate_passed && typeResult.block_reason) {
        blockReasons.push(typeResult.block_reason);
      }
    }

    const completedAt = new Date().toISOString();
    const gatePassed = blockReasons.length === 0;

    // Store the gate result as a note on the last run
    if (results.length > 0) {
      const gateNote = gatePassed
        ? `Gate PASSED (threshold: ${f1DropThreshold}, min: ${minF1})`
        : `Gate BLOCKED: ${blockReasons.join('; ')}`;

      for (const r of results) {
        await this.supabase
          .from('regression_runs')
          .update({ notes: gateNote })
          .eq('id', r.run_id);
      }
    }

    console.log(
      `[RegressionPipeline] Gate ${gatePassed ? 'PASSED' : 'BLOCKED'} ` +
      `(${results.length} types, commit=${req.commit_sha ?? 'unknown'})` +
      (blockReasons.length > 0 ? ` — ${blockReasons.join('; ')}` : ''),
    );

    return {
      gate_passed: gatePassed,
      triggered_by: req.triggered_by,
      commit_sha: req.commit_sha ?? null,
      branch: req.branch ?? null,
      f1_drop_threshold: f1DropThreshold,
      min_f1: minF1,
      results,
      block_reasons: blockReasons,
      started_at: startedAt,
      completed_at: completedAt,
    };
  }

  /**
   * Run evaluation for a single detection type and compare to previous.
   */
  private async evaluateType(
    orgId: string,
    userId: string,
    runType: string,
    req: RegressionGateRequest,
    f1DropThreshold: number,
    minF1: number,
  ): Promise<RegressionTypeResult> {
    // Get previous completed run for this type
    const previousRun = await this.getPreviousRun(runType);

    // Execute the evaluation
    let report: EvaluationReportResponse;
    try {
      report = await this.labeledDataset.runEvaluation(orgId, userId, {
        run_type: runType,
        tags: req.tags,
        triggered_by: req.triggered_by,
      });
    } catch (err) {
      // If no ground truth docs exist for this type, skip gracefully
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No active ground truth')) {
        return {
          run_type: runType,
          run_id: '',
          current_f1: 0,
          current_precision: 0,
          current_recall: 0,
          previous_f1: null,
          f1_delta: null,
          precision_delta: null,
          recall_delta: null,
          total_cases: 0,
          passed: 0,
          failed: 0,
          gate_passed: true, // no data = skip, don't block
          block_reason: null,
        };
      }
      throw err;
    }

    const currentF1 = report.aggregate_f1;
    const currentPrecision = report.aggregate_precision;
    const currentRecall = report.aggregate_recall;

    const previousF1 = previousRun?.f1_score ?? null;
    const previousPrecision = previousRun?.precision_score ?? null;
    const previousRecall = previousRun?.recall_score ?? null;

    const f1Delta = previousF1 !== null ? currentF1 - previousF1 : null;
    const precisionDelta = previousPrecision !== null ? currentPrecision - previousPrecision : null;
    const recallDelta = previousRecall !== null ? currentRecall - previousRecall : null;

    // Gate checks
    let gatePassed = true;
    let blockReason: string | null = null;

    // Check 1: Absolute minimum F1
    if (currentF1 < minF1 && report.total_cases > 0) {
      gatePassed = false;
      blockReason = `${runType}: F1 ${(currentF1 * 100).toFixed(1)}% below minimum ${(minF1 * 100).toFixed(1)}%`;
    }

    // Check 2: F1 regression from previous run
    if (gatePassed && f1Delta !== null && f1Delta < -f1DropThreshold) {
      gatePassed = false;
      blockReason = `${runType}: F1 dropped ${(Math.abs(f1Delta) * 100).toFixed(1)}pp ` +
        `(${(previousF1! * 100).toFixed(1)}% -> ${(currentF1 * 100).toFixed(1)}%), ` +
        `exceeds ${(f1DropThreshold * 100).toFixed(1)}pp threshold`;
    }

    return {
      run_type: runType,
      run_id: report.run_id,
      current_f1: currentF1,
      current_precision: currentPrecision,
      current_recall: currentRecall,
      previous_f1: previousF1,
      f1_delta: f1Delta !== null ? Math.round(f1Delta * 1000) / 1000 : null,
      precision_delta: precisionDelta !== null ? Math.round(precisionDelta * 1000) / 1000 : null,
      recall_delta: recallDelta !== null ? Math.round(recallDelta * 1000) / 1000 : null,
      total_cases: report.total_cases,
      passed: report.passed,
      failed: report.failed,
      gate_passed: gatePassed,
      block_reason: blockReason,
    };
  }

  /**
   * Get the most recent completed regression run for a given type.
   */
  private async getPreviousRun(
    runType: string,
  ): Promise<{ f1_score: number | null; precision_score: number | null; recall_score: number | null } | null> {
    const { data, error } = await this.supabase
      .from('regression_runs')
      .select('f1_score, precision_score, recall_score')
      .eq('run_type', runType)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // no previous run
      throw error;
    }
    return data;
  }

  /**
   * Determine which run types have active ground truth docs.
   */
  private async getActiveRunTypes(orgId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('ground_truth_documents')
      .select('document_type')
      .eq('is_active', true)
      .or(`organization_id.eq.${orgId},organization_id.is.null`);

    if (error) throw error;

    const types = new Set((data ?? []).map((d: { document_type: string }) => d.document_type));
    // Only return types we know how to evaluate
    return ALL_RUN_TYPES.filter((t) => types.has(t));
  }

  /**
   * Get regression history with deltas for the dashboard.
   */
  async getRegressionHistory(
    limit = 20,
  ): Promise<Array<{
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
  }>> {
    const { data: runs, error } = await this.supabase
      .from('regression_runs')
      .select('id, run_type, model, f1_score, precision_score, recall_score, triggered_by, status, notes, total_cases, passed, failed, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const enriched = [];
    for (const run of runs ?? []) {
      // Find the previous completed run of the same type before this one
      const { data: prev } = await this.supabase
        .from('regression_runs')
        .select('f1_score')
        .eq('run_type', run.run_type)
        .eq('status', 'completed')
        .lt('created_at', run.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const previousF1 = prev?.f1_score ?? null;
      const f1Delta = previousF1 !== null && run.f1_score !== null
        ? Math.round((run.f1_score - previousF1) * 1000) / 1000
        : null;

      enriched.push({
        ...run,
        previous_f1: previousF1,
        f1_delta: f1Delta,
      });
    }

    return enriched;
  }
}
