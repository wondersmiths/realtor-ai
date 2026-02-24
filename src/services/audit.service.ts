import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { AuditLog } from '@/types/database';
import { AuditAction } from '@/types/enums';
import type { PaginationParams, PaginatedResponse } from '@/types/api';
import { AppError } from '@/lib/errors';

export interface AuditLogParams {
  organizationId?: string | null;
  userId?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Insert a new audit log entry.
   */
  async log(params: AuditLogParams): Promise<AuditLog> {
    const { data, error } = await this.supabase
      .from('audit_logs')
      .insert({
        organization_id: params.organizationId || null,
        user_id: params.userId || null,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        metadata: params.metadata || {},
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      })
      .select('*')
      .single();

    if (error || !data) {
      // Audit logging should not throw and break the caller flow in production.
      // Log the error and return a partial object.
      console.error('[AuditService] Failed to write audit log:', error?.message);
      return {
        id: '',
        organization_id: params.organizationId || null,
        user_id: params.userId || null,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        metadata: params.metadata || {},
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
        created_at: new Date().toISOString(),
      };
    }

    return data as AuditLog;
  }

  /**
   * List audit logs for an organization with pagination and optional filters.
   */
  async list(
    orgId: string,
    filters: PaginationParams & {
      action?: AuditAction;
      userId?: string;
      resourceType?: string;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    const {
      page = 1,
      pageSize = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
      action,
      userId,
      resourceType,
      startDate,
      endDate,
    } = filters;

    const offset = (page - 1) * pageSize;

    // Count total
    let countQuery = this.supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    if (action) countQuery = countQuery.eq('action', action);
    if (userId) countQuery = countQuery.eq('user_id', userId);
    if (resourceType) countQuery = countQuery.eq('resource_type', resourceType);
    if (startDate) countQuery = countQuery.gte('created_at', startDate);
    if (endDate) countQuery = countQuery.lte('created_at', endDate);

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch audit logs
    let query = this.supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (search) {
      query = query.or(
        `action.ilike.%${search}%,resource_type.ilike.%${search}%,resource_id.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list audit logs: ${error.message}`);
    }

    return {
      data: (data || []) as AuditLog[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get audit logs for a specific resource.
   */
  async getByResource(
    resourceType: string,
    resourceId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<AuditLog>> {
    const {
      page = 1,
      pageSize = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params;

    const offset = (page - 1) * pageSize;

    const { count } = await this.supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId);

    const total = count ?? 0;

    const { data, error } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new AppError(`Failed to fetch audit logs: ${error.message}`);
    }

    return {
      data: (data || []) as AuditLog[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
