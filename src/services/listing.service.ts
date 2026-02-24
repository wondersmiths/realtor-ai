import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { Listing, ComplianceCheck } from '@/types/database';
import { ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';
import type { ListingWithAgent } from '@/types/domain';
import type {
  PaginationParams,
  PaginatedResponse,
  CreateListingRequest,
  UpdateListingRequest,
} from '@/types/api';
import { NotFoundError, AppError } from '@/lib/errors';

export class ListingService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List listings for an organization with pagination.
   */
  async list(
    orgId: string,
    params: PaginationParams & { status?: string; agentId?: string } = {}
  ): Promise<PaginatedResponse<ListingWithAgent>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
      status,
      agentId,
    } = params;

    const offset = (page - 1) * pageSize;

    // Count total
    let countQuery = this.supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (status) {
      countQuery = countQuery.eq('listing_status', status);
    }
    if (agentId) {
      countQuery = countQuery.eq('agent_id', agentId);
    }
    if (search) {
      countQuery = countQuery.or(
        `address.ilike.%${search}%,mls_number.ilike.%${search}%,city.ilike.%${search}%`
      );
    }

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch listings with agent profile
    let query = this.supabase
      .from('listings')
      .select(`
        *,
        agent:profiles!listings_agent_id_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (status) {
      query = query.eq('listing_status', status);
    }
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    if (search) {
      query = query.or(
        `address.ilike.%${search}%,mls_number.ilike.%${search}%,city.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list listings: ${error.message}`);
    }

    return {
      data: (data || []) as unknown as ListingWithAgent[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single listing by ID with agent details.
   */
  async getById(orgId: string, listingId: string): Promise<ListingWithAgent> {
    const { data, error } = await this.supabase
      .from('listings')
      .select(`
        *,
        agent:profiles!listings_agent_id_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('id', listingId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundError('Listing not found');
    }

    return data as unknown as ListingWithAgent;
  }

  /**
   * Create a new listing.
   */
  async create(
    orgId: string,
    agentId: string,
    input: CreateListingRequest
  ): Promise<Listing> {
    const { data, error } = await this.supabase
      .from('listings')
      .insert({
        organization_id: orgId,
        agent_id: agentId,
        mls_number: input.mls_number || null,
        address: input.address,
        city: input.city,
        state: input.state,
        zip_code: input.zip_code,
        price: input.price || null,
        bedrooms: input.bedrooms || null,
        bathrooms: input.bathrooms || null,
        square_feet: input.square_feet || null,
        description: input.description || null,
        property_type: input.property_type || null,
        listing_status: input.listing_status || 'draft',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to create listing: ${error?.message}`);
    }

    return data as Listing;
  }

  /**
   * Update an existing listing.
   */
  async update(
    orgId: string,
    listingId: string,
    input: UpdateListingRequest
  ): Promise<Listing> {
    const { data, error } = await this.supabase
      .from('listings')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundError('Listing not found');
    }

    return data as Listing;
  }

  /**
   * Soft-delete a listing.
   */
  async softDelete(orgId: string, listingId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('listings')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      throw new NotFoundError('Listing not found');
    }
  }

  /**
   * Request a compliance check for a listing.
   * Creates a new compliance_check record with pending status.
   */
  async requestComplianceCheck(
    orgId: string,
    listingId: string,
    initiatedBy: string,
    checkType: ComplianceCheckType = ComplianceCheckType.ListingCompliance
  ): Promise<ComplianceCheck> {
    // Verify the listing exists
    const listing = await this.getById(orgId, listingId);

    const { data, error } = await this.supabase
      .from('compliance_checks')
      .insert({
        organization_id: orgId,
        check_type: checkType,
        status: ComplianceCheckStatus.Pending,
        listing_id: listingId,
        initiated_by: initiatedBy,
        input_text: listing.description || null,
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
   * Get the compliance check history for a listing.
   */
  async getComplianceHistory(
    orgId: string,
    listingId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<ComplianceCheck>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params;

    const offset = (page - 1) * pageSize;

    const { count } = await this.supabase
      .from('compliance_checks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('listing_id', listingId);

    const total = count ?? 0;

    const { data, error } = await this.supabase
      .from('compliance_checks')
      .select('*')
      .eq('organization_id', orgId)
      .eq('listing_id', listingId)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new AppError(`Failed to fetch compliance history: ${error.message}`);
    }

    return {
      data: (data || []) as ComplianceCheck[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
