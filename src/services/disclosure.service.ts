import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { Disclosure } from '@/types/database';
import { DisclosureType, DisclosureStatus } from '@/types/enums';
import type { DisclosureWithDetails } from '@/types/domain';
import type {
  PaginationParams,
  PaginatedResponse,
  CreateDisclosureRequest,
  UpdateDisclosureRequest,
} from '@/types/api';
import { NotFoundError, AppError } from '@/lib/errors';

/**
 * Lookup table of required disclosure types by state code (two-letter abbreviation).
 * This is a simplified representation; actual requirements vary by transaction type.
 */
const STATE_REQUIRED_DISCLOSURES: Record<string, DisclosureType[]> = {
  CA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.NaturalHazard,
    DisclosureType.PropertyCondition,
    DisclosureType.FloodZone,
    DisclosureType.Title,
  ],
  TX: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.FloodZone,
  ],
  NY: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.Title,
  ],
  FL: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.FloodZone,
    DisclosureType.HOA,
  ],
  IL: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  PA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  OH: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  GA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.FloodZone,
  ],
  NC: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  MI: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  NJ: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.FloodZone,
    DisclosureType.Title,
  ],
  VA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  WA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.NaturalHazard,
  ],
  AZ: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  MA: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.Title,
  ],
  CO: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
  ],
  NV: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.HOA,
  ],
  OR: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.NaturalHazard,
  ],
  HI: [
    DisclosureType.SellerDisclosure,
    DisclosureType.LeadPaint,
    DisclosureType.PropertyCondition,
    DisclosureType.NaturalHazard,
  ],
};

/**
 * Default disclosures required in all states (federal minimum).
 */
const DEFAULT_DISCLOSURES: DisclosureType[] = [
  DisclosureType.SellerDisclosure,
  DisclosureType.LeadPaint,
];

export class DisclosureService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List disclosures for an organization with pagination.
   */
  async list(
    orgId: string,
    params: PaginationParams & {
      status?: DisclosureStatus;
      listingId?: string;
      disclosureType?: DisclosureType;
    } = {}
  ): Promise<PaginatedResponse<DisclosureWithDetails>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
      status,
      listingId,
      disclosureType,
    } = params;

    const offset = (page - 1) * pageSize;

    // Count total
    let countQuery = this.supabase
      .from('disclosures')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (status) countQuery = countQuery.eq('status', status);
    if (listingId) countQuery = countQuery.eq('listing_id', listingId);
    if (disclosureType) countQuery = countQuery.eq('disclosure_type', disclosureType);
    if (search) countQuery = countQuery.ilike('title', `%${search}%`);

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch disclosures with listing and document joins
    let query = this.supabase
      .from('disclosures')
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
        )
      `)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq('status', status);
    if (listingId) query = query.eq('listing_id', listingId);
    if (disclosureType) query = query.eq('disclosure_type', disclosureType);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list disclosures: ${error.message}`);
    }

    return {
      data: (data || []) as unknown as DisclosureWithDetails[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single disclosure by ID.
   */
  async getById(orgId: string, disclosureId: string): Promise<DisclosureWithDetails> {
    const { data, error } = await this.supabase
      .from('disclosures')
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
        )
      `)
      .eq('id', disclosureId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundError('Disclosure not found');
    }

    return data as unknown as DisclosureWithDetails;
  }

  /**
   * Create a new disclosure.
   */
  async create(orgId: string, input: CreateDisclosureRequest): Promise<Disclosure> {
    const { data, error } = await this.supabase
      .from('disclosures')
      .insert({
        organization_id: orgId,
        listing_id: input.listing_id,
        disclosure_type: input.disclosure_type,
        title: input.title,
        description: input.description || null,
        status: DisclosureStatus.Required,
        due_date: input.due_date || null,
        notes: input.notes || null,
        document_id: input.document_id || null,
        assigned_to: input.assigned_to || null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to create disclosure: ${error?.message}`);
    }

    return data as Disclosure;
  }

  /**
   * Update a disclosure.
   */
  async update(
    orgId: string,
    disclosureId: string,
    input: UpdateDisclosureRequest
  ): Promise<Disclosure> {
    const updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
    };

    // If status is changing to accepted/reviewed, set completed_at
    if (
      input.status === DisclosureStatus.Accepted ||
      input.status === DisclosureStatus.Reviewed
    ) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('disclosures')
      .update(updateData)
      .eq('id', disclosureId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundError('Disclosure not found');
    }

    return data as Disclosure;
  }

  /**
   * Soft-delete a disclosure.
   */
  async softDelete(orgId: string, disclosureId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('disclosures')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', disclosureId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      throw new NotFoundError('Disclosure not found');
    }
  }

  /**
   * Get the list of required disclosure types for a given state.
   */
  getRequiredDisclosures(stateCode: string): DisclosureType[] {
    const upper = stateCode.toUpperCase();
    return STATE_REQUIRED_DISCLOSURES[upper] || DEFAULT_DISCLOSURES;
  }

  /**
   * Check completeness of disclosures for a listing.
   * Compares existing disclosures against state requirements.
   */
  async checkCompleteness(
    orgId: string,
    listingId: string
  ): Promise<{
    required: DisclosureType[];
    completed: DisclosureType[];
    missing: DisclosureType[];
    overdue: Disclosure[];
    completenessPercent: number;
  }> {
    // Fetch the listing to determine state
    const { data: listing, error: listingError } = await this.supabase
      .from('listings')
      .select('state')
      .eq('id', listingId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single();

    if (listingError || !listing) {
      throw new NotFoundError('Listing not found');
    }

    const required = this.getRequiredDisclosures(listing.state);

    // Fetch existing disclosures for this listing
    const { data: disclosures, error: discError } = await this.supabase
      .from('disclosures')
      .select('*')
      .eq('organization_id', orgId)
      .eq('listing_id', listingId)
      .is('deleted_at', null);

    if (discError) {
      throw new AppError(`Failed to fetch disclosures: ${discError.message}`);
    }

    const typedDisclosures = (disclosures || []) as Disclosure[];

    const completedStatuses = new Set<string>([
      DisclosureStatus.Accepted,
      DisclosureStatus.Reviewed,
      DisclosureStatus.Submitted,
    ]);

    const completedTypes = new Set(
      typedDisclosures
        .filter((d) => completedStatuses.has(d.status))
        .map((d) => d.disclosure_type)
    );

    const completed = required.filter((t) => completedTypes.has(t));
    const missing = required.filter((t) => !completedTypes.has(t));

    const now = new Date().toISOString();
    const overdue = typedDisclosures.filter(
      (d) =>
        d.due_date &&
        d.due_date < now &&
        !completedStatuses.has(d.status)
    );

    const completenessPercent =
      required.length === 0 ? 100 : Math.round((completed.length / required.length) * 100);

    return {
      required,
      completed,
      missing,
      overdue,
      completenessPercent,
    };
  }

  /**
   * Get all overdue disclosures for an organization.
   */
  async getOverdue(orgId: string): Promise<Disclosure[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('disclosures')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .lt('due_date', now)
      .not('status', 'in', `(${DisclosureStatus.Accepted},${DisclosureStatus.Reviewed},${DisclosureStatus.Submitted})`)
      .order('due_date', { ascending: true });

    if (error) {
      throw new AppError(`Failed to fetch overdue disclosures: ${error.message}`);
    }

    return (data || []) as Disclosure[];
  }
}
