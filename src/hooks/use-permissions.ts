import { useMemo } from 'react';
import { UserRole } from '@/types/enums';
import { useOrganization } from './use-organization';

export interface Permissions {
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  canManageMembers: boolean;
  canManageBilling: boolean;
  canDeleteResources: boolean;
  canViewAuditLog: boolean;
}

export function usePermissions(): Permissions {
  const { userRole } = useOrganization();

  return useMemo(() => {
    const isOwner = userRole === UserRole.Owner;
    const isAdmin = userRole === UserRole.Admin;
    const isAgent = userRole === UserRole.Agent;

    return {
      isOwner,
      isAdmin,
      isAgent,
      canManageMembers: isOwner || isAdmin,
      canManageBilling: isOwner,
      canDeleteResources: isOwner || isAdmin,
      canViewAuditLog: isOwner || isAdmin,
    };
  }, [userRole]);
}
