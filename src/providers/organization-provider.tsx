'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Organization } from '@/types/database';
import type { UserRole } from '@/types/enums';
import { SupabaseContext } from './supabase-provider';

interface OrganizationContextValue {
  currentOrg: Organization | null;
  userRole: UserRole | null;
  organizations: (Organization & { role: UserRole; membershipId: string })[];
  setCurrentOrg: (orgId: string) => void;
  isLoading: boolean;
}

export const OrganizationContext = createContext<
  OrganizationContextValue | undefined
>(undefined);

/**
 * Sets a cookie accessible by middleware for the active org ID.
 */
function setOrgCookie(orgId: string) {
  document.cookie = `x-org-id=${orgId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error(
      'OrganizationProvider must be rendered inside SupabaseProvider'
    );
  }
  const { user, supabase } = ctx;

  const [organizations, setOrganizations] = useState<
    (Organization & { role: UserRole; membershipId: string })[]
  >([]);
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the user's organizations through memberships
  useEffect(() => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrgState(null);
      setUserRole(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchOrgs() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('memberships')
        .select('id, role, organization_id, organizations(*)')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null);

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch organizations:', error.message);
        setIsLoading(false);
        return;
      }

      const orgs = (data ?? []).map((m: any) => ({
        ...(m.organizations as Organization),
        role: m.role as UserRole,
        membershipId: m.id as string,
      }));

      setOrganizations(orgs);

      // Try to restore previously selected org from cookie
      const cookieOrgId = document.cookie
        .split('; ')
        .find((c) => c.startsWith('x-org-id='))
        ?.split('=')[1];

      const restoredOrg = cookieOrgId
        ? orgs.find((o) => o.id === cookieOrgId)
        : undefined;

      if (restoredOrg) {
        setCurrentOrgState(restoredOrg);
        setUserRole(restoredOrg.role);
      } else if (orgs.length > 0) {
        // Default to first org
        setCurrentOrgState(orgs[0]);
        setUserRole(orgs[0].role);
        setOrgCookie(orgs[0].id);
      }

      setIsLoading(false);
    }

    fetchOrgs();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const setCurrentOrg = useCallback(
    (orgId: string) => {
      const org = organizations.find((o) => o.id === orgId);
      if (!org) return;
      setCurrentOrgState(org);
      setUserRole(org.role);
      setOrgCookie(orgId);
    },
    [organizations]
  );

  return (
    <OrganizationContext.Provider
      value={{ currentOrg, userRole, organizations, setCurrentOrg, isLoading }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
