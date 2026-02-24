import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { Organization, Membership, Profile } from '@/types/database';
import type { UserRole } from '@/types/enums';
import type { PaginationParams, PaginatedResponse, UpdateOrganizationRequest } from '@/types/api';
import { NotFoundError, AppError, ValidationError } from '@/lib/errors';

export interface MemberWithProfile extends Membership {
  profile: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'> | null;
}

export class OrganizationService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get an organization by ID.
   */
  async getById(orgId: string): Promise<Organization> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundError('Organization not found');
    }

    return data as Organization;
  }

  /**
   * Get an organization by slug.
   */
  async getBySlug(slug: string): Promise<Organization> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundError('Organization not found');
    }

    return data as Organization;
  }

  /**
   * Update an organization's details.
   */
  async update(orgId: string, updates: UpdateOrganizationRequest): Promise<Organization> {
    // If slug is being updated, check uniqueness
    if (updates.slug) {
      const { data: existing } = await this.supabase
        .from('organizations')
        .select('id')
        .eq('slug', updates.slug)
        .neq('id', orgId)
        .is('deleted_at', null)
        .single();

      if (existing) {
        throw new ValidationError('Slug already in use', { slug: ['This slug is already taken'] });
      }
    }

    const { data, error } = await this.supabase
      .from('organizations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to update organization: ${error?.message}`);
    }

    return data as Organization;
  }

  /**
   * Soft-delete an organization.
   */
  async softDelete(orgId: string): Promise<void> {
    const { error } = await this.supabase
      .from('organizations')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .is('deleted_at', null);

    if (error) {
      throw new AppError(`Failed to delete organization: ${error.message}`);
    }
  }

  /**
   * List members of an organization with pagination and profile joins.
   */
  async listMembers(
    orgId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<MemberWithProfile>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
    } = params;

    const offset = (page - 1) * pageSize;

    // Count total
    const countQuery = this.supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch members with profiles
    const query = this.supabase
      .from('memberships')
      .select(`
        *,
        profile:profiles (
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

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list members: ${error.message}`);
    }

    let members = (data || []) as unknown as MemberWithProfile[];

    // Client-side search filter on profile name/email if needed
    if (search) {
      const lowerSearch = search.toLowerCase();
      members = members.filter(
        (m) =>
          m.profile?.email?.toLowerCase().includes(lowerSearch) ||
          m.profile?.full_name?.toLowerCase().includes(lowerSearch) ||
          m.invited_email?.toLowerCase().includes(lowerSearch)
      );
    }

    return {
      data: members,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Invite a new member to the organization by email.
   * Creates a membership record with invited_email (user_id will be populated on acceptance).
   */
  async inviteMember(
    orgId: string,
    invitedEmail: string,
    role: UserRole,
    invitedBy: string
  ): Promise<Membership> {
    // Check if there's already an active or pending membership for this email
    const { data: existingByEmail } = await this.supabase
      .from('memberships')
      .select('id')
      .eq('organization_id', orgId)
      .eq('invited_email', invitedEmail)
      .is('deleted_at', null)
      .single();

    if (existingByEmail) {
      throw new ValidationError('This email has already been invited', {
        email: ['Member already invited'],
      });
    }

    // Also check if a user with this email already has a membership
    const { data: profileMatch } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('email', invitedEmail)
      .single();

    if (profileMatch) {
      const { data: existingMembership } = await this.supabase
        .from('memberships')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', profileMatch.id)
        .is('deleted_at', null)
        .single();

      if (existingMembership) {
        throw new ValidationError('This user is already a member of the organization', {
          email: ['User already a member'],
        });
      }
    }

    const { data, error } = await this.supabase
      .from('memberships')
      .insert({
        organization_id: orgId,
        user_id: profileMatch?.id || null,
        invited_email: invitedEmail,
        invited_by: invitedBy,
        role,
        accepted_at: profileMatch ? null : null, // remains null until accepted
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to invite member: ${error?.message}`);
    }

    return data as Membership;
  }

  /**
   * Update a member's role within the organization.
   */
  async updateMemberRole(
    orgId: string,
    membershipId: string,
    newRole: UserRole
  ): Promise<Membership> {
    const { data, error } = await this.supabase
      .from('memberships')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', membershipId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundError('Membership not found');
    }

    return data as Membership;
  }

  /**
   * Soft-delete a member from the organization.
   */
  async removeMember(orgId: string, membershipId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('memberships')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', membershipId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      throw new NotFoundError('Membership not found');
    }
  }
}
