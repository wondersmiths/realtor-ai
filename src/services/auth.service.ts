import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Membership, Organization } from '@/types/database';
import type { UserRole } from '@/types/enums';
import type { OrganizationWithMembership } from '@/types/domain';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '@/lib/errors';
import { slugify } from '@/lib/utils';

export class AuthService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get the currently authenticated user and their profile.
   * Throws UnauthorizedError if no session exists.
   */
  async getCurrentUser(): Promise<{ authUser: { id: string; email: string }; profile: Profile }> {
    const {
      data: { user },
      error: authError,
    } = await this.supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError('Not authenticated');
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .is('deleted_at', null)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile not found');
    }

    return {
      authUser: { id: user.id, email: user.email! },
      profile: profile as Profile,
    };
  }

  /**
   * Fetch all organization memberships for a given user, including org details.
   * Returns active (non-deleted) memberships with their associated organizations.
   */
  async getUserMemberships(userId: string): Promise<OrganizationWithMembership[]> {
    // Fetch accepted (non-deleted) memberships with their associated organizations
    const { data: memberships, error } = await this.supabase
      .from('memberships')
      .select(`
        id,
        role,
        organization_id,
        organizations (*)
      `)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null);

    if (error) {
      throw new AppError(`Failed to fetch memberships: ${error.message}`);
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    return memberships
      .filter((m: any) => m.organizations && !m.organizations.deleted_at)
      .map((m: any) => ({
        ...m.organizations,
        userRole: m.role as UserRole,
        membershipId: m.id as string,
      }));
  }

  /**
   * Assert the current user has one of the specified roles within an organization.
   * Throws ForbiddenError if the user lacks the required role.
   */
  async requireRole(orgId: string, ...roles: UserRole[]): Promise<Membership> {
    const { authUser } = await this.getCurrentUser();

    const { data: membership, error } = await this.supabase
      .from('memberships')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null)
      .single();

    if (error || !membership) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    const typedMembership = membership as Membership;

    if (!roles.includes(typedMembership.role)) {
      throw new ForbiddenError(
        `Requires one of [${roles.join(', ')}] role. You have: ${typedMembership.role}`
      );
    }

    return typedMembership;
  }

  /**
   * Create a new organization and add the creator as the owner.
   * Generates a slug from the name if not provided.
   */
  async createOrganization(
    userId: string,
    name: string,
    slug?: string
  ): Promise<{ organization: Organization; membership: Membership }> {
    const orgSlug = slug || slugify(name);

    // Check for slug uniqueness
    const { data: existing } = await this.supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .is('deleted_at', null)
      .single();

    if (existing) {
      throw new AppError('An organization with this slug already exists', 409, 'SLUG_CONFLICT');
    }

    // Create the organization
    const { data: organization, error: orgError } = await this.supabase
      .from('organizations')
      .insert({
        name,
        slug: orgSlug,
        settings: {},
        ai_enabled: true,
        plan_tier: 'free',
        subscription_status: 'trialing',
      })
      .select('*')
      .single();

    if (orgError || !organization) {
      throw new AppError(`Failed to create organization: ${orgError?.message}`);
    }

    const typedOrg = organization as Organization;

    // Create the owner membership
    const { data: membership, error: memberError } = await this.supabase
      .from('memberships')
      .insert({
        user_id: userId,
        organization_id: typedOrg.id,
        role: 'owner',
        accepted_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (memberError || !membership) {
      // Attempt cleanup on failure
      await this.supabase.from('organizations').delete().eq('id', typedOrg.id);
      throw new AppError(`Failed to create membership: ${memberError?.message}`);
    }

    return {
      organization: typedOrg,
      membership: membership as Membership,
    };
  }
}
