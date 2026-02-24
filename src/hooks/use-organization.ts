import { useContext } from 'react';
import { OrganizationContext } from '@/providers/organization-provider';

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error(
      'useOrganization must be used within an OrganizationProvider'
    );
  }
  return ctx;
}
