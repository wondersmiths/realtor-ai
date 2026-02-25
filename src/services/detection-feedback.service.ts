import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { DetectionResult } from '@/types/database';
import type { DetectionResultWithReviewer } from '@/types/domain';
import type {
  SubmitDetectionFeedbackRequest,
  DetectionFeedbackStats,
} from '@/types/api';

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class DetectionFeedbackService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Submit feedback on a detection result: mark as false positive or
   * missed signature. Creates a detection_error record with full audit
   * trail (document hash, detection method, error type, timestamp).
   */
  async submitFeedback(
    orgId: string,
    userId: string,
    req: SubmitDetectionFeedbackRequest,
  ): Promise<{ detection_result: DetectionResult; error_id: string }> {
    // 1. Fetch the detection result
    const { data: result, error: fetchErr } = await this.supabase
      .from('detection_results')
      .select('*')
      .eq('id', req.detection_result_id)
      .eq('organization_id', orgId)
      .single();

    if (fetchErr || !result) {
      throw new Error('Detection result not found');
    }

    // 2. Mark the detection result as reviewed
    const isCorrect = false; // admin is flagging an error
    const { data: updated, error: updateErr } = await this.supabase
      .from('detection_results')
      .update({
        is_correct: isCorrect,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        feedback_notes: req.feedback_notes ?? null,
      })
      .eq('id', req.detection_result_id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    // 3. Create the detection_error log entry
    const { data: errorEntry, error: insertErr } = await this.supabase
      .from('detection_errors')
      .insert({
        organization_id: orgId,
        detection_result_id: req.detection_result_id,
        error_type: req.error_type,
        expected_output: req.expected_output ?? null,
        actual_output: result.detected_items ? { items: result.detected_items } : null,
        severity: req.severity ?? 'medium',
        root_cause: null,
        resolved: false,
        document_hash: req.document_hash ?? null,
        detection_method: result.detection_type,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    console.log(
      `[DetectionFeedback] ${req.error_type} logged for result=${req.detection_result_id} ` +
      `doc_hash=${req.document_hash ?? 'none'} method=${result.detection_type} by=${userId}`,
    );

    return {
      detection_result: updated as DetectionResult,
      error_id: errorEntry.id,
    };
  }

  /**
   * Mark a detection result as correct (confirming the AI was right).
   */
  async confirmCorrect(
    orgId: string,
    userId: string,
    detectionResultId: string,
  ): Promise<DetectionResult> {
    const { data, error } = await this.supabase
      .from('detection_results')
      .update({
        is_correct: true,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', detectionResultId)
      .eq('organization_id', orgId)
      .select('*')
      .single();

    if (error) throw error;
    return data as DetectionResult;
  }

  /**
   * List detection results with filters and pagination.
   */
  async listDetectionResults(
    orgId: string,
    filters: {
      page?: number;
      pageSize?: number;
      detection_type?: string;
      reviewed?: 'true' | 'false' | 'all';
    } = {},
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('detection_results')
      .select(
        '*, reviewer:profiles!detection_results_reviewed_by_fkey(id, email, full_name)',
        { count: 'exact' },
      )
      .eq('organization_id', orgId);

    if (filters.detection_type) {
      query = query.eq('detection_type', filters.detection_type);
    }

    if (filters.reviewed === 'true') {
      query = query.not('is_correct', 'is', null);
    } else if (filters.reviewed === 'false') {
      query = query.is('is_correct', null);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      data: (data ?? []) as DetectionResultWithReviewer[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    };
  }

  /**
   * List detection errors for rule improvement analysis.
   */
  async listDetectionErrors(
    orgId: string,
    filters: {
      page?: number;
      pageSize?: number;
      error_type?: string;
      resolved?: boolean;
    } = {},
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('detection_errors')
      .select(
        'id, detection_result_id, error_type, severity, root_cause, resolved, resolved_at, document_hash, detection_method, created_at',
        { count: 'exact' },
      )
      .eq('organization_id', orgId);

    if (filters.error_type) {
      query = query.eq('error_type', filters.error_type);
    }
    if (filters.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
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

  /**
   * Resolve a detection error (mark as addressed for rule improvement).
   */
  async resolveError(
    orgId: string,
    userId: string,
    errorId: string,
    rootCause?: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('detection_errors')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        root_cause: rootCause ?? null,
      })
      .eq('id', errorId)
      .eq('organization_id', orgId);

    if (error) throw error;
  }

  /**
   * Get aggregate feedback stats for rule improvement dashboard.
   */
  async getFeedbackStats(orgId: string): Promise<DetectionFeedbackStats> {
    // Counts from detection_results
    const [
      { count: totalResults },
      { count: reviewed },
      { count: unreviewed },
    ] = await Promise.all([
      this.supabase
        .from('detection_results')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId),
      this.supabase
        .from('detection_results')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('is_correct', 'is', null),
      this.supabase
        .from('detection_results')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('is_correct', null),
    ]);

    // Counts from detection_errors by type
    const [
      { count: falsePositives },
      { count: missedSignatures },
      { count: falseNegatives },
      { count: misclassifications },
    ] = await Promise.all([
      this.supabase
        .from('detection_errors')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('error_type', 'false_positive'),
      this.supabase
        .from('detection_errors')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('error_type', 'missed_signature'),
      this.supabase
        .from('detection_errors')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('error_type', 'false_negative'),
      this.supabase
        .from('detection_errors')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('error_type', 'misclassification'),
    ]);

    // By detection type breakdown
    const { data: resultsByType } = await this.supabase
      .from('detection_results')
      .select('detection_type, is_correct')
      .eq('organization_id', orgId);

    const { data: errorsByType } = await this.supabase
      .from('detection_errors')
      .select('detection_method, error_type')
      .eq('organization_id', orgId);

    const byDetectionType: Record<string, { total: number; false_positives: number; missed_signatures: number }> = {};
    for (const r of resultsByType ?? []) {
      const dt = r.detection_type;
      if (!byDetectionType[dt]) {
        byDetectionType[dt] = { total: 0, false_positives: 0, missed_signatures: 0 };
      }
      byDetectionType[dt].total++;
    }
    for (const e of errorsByType ?? []) {
      const dt = e.detection_method ?? 'unknown';
      if (!byDetectionType[dt]) {
        byDetectionType[dt] = { total: 0, false_positives: 0, missed_signatures: 0 };
      }
      if (e.error_type === 'false_positive') byDetectionType[dt].false_positives++;
      if (e.error_type === 'missed_signature') byDetectionType[dt].missed_signatures++;
    }

    // Recent errors
    const { data: recentErrors } = await this.supabase
      .from('detection_errors')
      .select('id, detection_result_id, error_type, severity, document_hash, detection_method, root_cause, resolved, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      total_results: totalResults ?? 0,
      reviewed: reviewed ?? 0,
      unreviewed: unreviewed ?? 0,
      false_positives: falsePositives ?? 0,
      missed_signatures: missedSignatures ?? 0,
      false_negatives: falseNegatives ?? 0,
      misclassifications: misclassifications ?? 0,
      by_detection_type: byDetectionType,
      recent_errors: (recentErrors ?? []).map((e) => ({
        id: e.id,
        detection_result_id: e.detection_result_id,
        error_type: e.error_type,
        severity: e.severity,
        detection_type: e.detection_method ?? 'unknown',
        document_hash: e.document_hash ?? null,
        root_cause: e.root_cause ?? null,
        resolved: e.resolved,
        created_at: e.created_at,
      })),
    };
  }
}
