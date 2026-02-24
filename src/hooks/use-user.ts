import { useContext } from 'react';
import { SupabaseContext } from '@/providers/supabase-provider';

export function useUser() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useUser must be used within a SupabaseProvider');
  }
  return {
    user: ctx.user,
    isLoading: ctx.isLoading,
    supabase: ctx.supabase,
  };
}
