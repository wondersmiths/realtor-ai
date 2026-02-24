import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { ComplianceCheck } from '@/types/database';
import {
  ComplianceCheckType,
  ComplianceCheckStatus,
} from '@/types/enums';
import type { ComplianceCheckWithDetails } from '@/types/domain';
import type {
  PaginationParams,
  PaginatedResponse,
  ComplianceCheckRequest,
} from '@/types/api';
import { NotFoundError, AppError } from '@/lib/errors';

export class ComplianceService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new compliance check record.
   * This only manages the database record -- the actual AI logic lives in AIService.
   */
  async runCheck(
    orgId: string,
    initiatedBy: string,
    request: ComplianceCheckRequest
  ): Promise<ComplianceCheck> {
    const { data, error } = await this.supabase
      .from('compliance_checks')
      .insert({
        organization_id: orgId,
        check_type: request.check_type,
        status: ComplianceCheckStatus.Pending,
        listing_id: request.listing_id || null,
        document_id: request.document_id || null,
        input_text: request.input_text || null,
        initiated_by: initiatedBy,
        ai_used: false,
        findings: [],
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to create compliance check: ${error?.message}`);
    }

    return data as ComplianceCheck;
  }

  /**
   * Update a compliance check record with results.
   */
  async updateCheckResult(
    checkId: string,
    result: {
      status: ComplianceCheckStatus;
      score?: number;
      findings?: ComplianceCheck['findings'];
      summary?: string;
      ai_used?: boolean;
      model_used?: string;
      tokens_used?: number;
    }
  ): Promise<ComplianceCheck> {
    const updateData: Record<string, unknown> = {
      status: result.status,
      updated_at: new Date().toISOString(),
    };

    if (result.score !== undefined) updateData.score = result.score;
    if (result.findings !== undefined) updateData.findings = result.findings;
    if (result.summary !== undefined) updateData.summary = result.summary;
    if (result.ai_used !== undefined) updateData.ai_used = result.ai_used;
    if (result.model_used !== undefined) updateData.model_used = result.model_used;
    if (result.tokens_used !== undefined) updateData.tokens_used = result.tokens_used;

    if (
      result.status === ComplianceCheckStatus.Completed ||
      result.status === ComplianceCheckStatus.Failed
    ) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('compliance_checks')
      .update(updateData)
      .eq('id', checkId)
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to update compliance check: ${error?.message}`);
    }

    return data as ComplianceCheck;
  }

  /**
   * Mark a check as running.
   */
  async markRunning(checkId: string): Promise<ComplianceCheck> {
    return this.updateCheckResult(checkId, {
      status: ComplianceCheckStatus.Running,
    });
  }

  /**
   * Mark a check as failed.
   */
  async markFailed(checkId: string, summary?: string): Promise<ComplianceCheck> {
    return this.updateCheckResult(checkId, {
      status: ComplianceCheckStatus.Failed,
      summary: summary || 'Check failed',
    });
  }

  /**
   * Get paginated list of compliance checks for an organization.
   */
  async getChecks(
    orgId: string,
    params: PaginationParams & {
      checkType?: ComplianceCheckType;
      status?: ComplianceCheckStatus;
      listingId?: string;
      documentId?: string;
    } = {}
  ): Promise<PaginatedResponse<ComplianceCheckWithDetails>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      checkType,
      status,
      listingId,
      documentId,
    } = params;

    const offset = (page - 1) * pageSize;

    // Count total
    let countQuery = this.supabase
      .from('compliance_checks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    if (checkType) countQuery = countQuery.eq('check_type', checkType);
    if (status) countQuery = countQuery.eq('status', status);
    if (listingId) countQuery = countQuery.eq('listing_id', listingId);
    if (documentId) countQuery = countQuery.eq('document_id', documentId);

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch checks with related listing/document/initiator
    let query = this.supabase
      .from('compliance_checks')
      .select(`
        *,
        listing:listings (
          id,
          address,
          mls_number
        ),
        document:documents (
          id,
          name,
          file_type
        ),
        initiated_by_profile:profiles!compliance_checks_initiated_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('organization_id', orgId)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (checkType) query = query.eq('check_type', checkType);
    if (status) query = query.eq('status', status);
    if (listingId) query = query.eq('listing_id', listingId);
    if (documentId) query = query.eq('document_id', documentId);

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list compliance checks: ${error.message}`);
    }

    return {
      data: (data || []) as unknown as ComplianceCheckWithDetails[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single compliance check by ID with full details.
   */
  async getCheckById(
    orgId: string,
    checkId: string
  ): Promise<ComplianceCheckWithDetails> {
    const { data, error } = await this.supabase
      .from('compliance_checks')
      .select(`
        *,
        listing:listings (
          id,
          address,
          mls_number
        ),
        document:documents (
          id,
          name,
          file_type
        ),
        initiated_by_profile:profiles!compliance_checks_initiated_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('id', checkId)
      .eq('organization_id', orgId)
      .single();

    if (error || !data) {
      throw new NotFoundError('Compliance check not found');
    }

    return data as unknown as ComplianceCheckWithDetails;
  }
}
