import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useUser } from './use-user';

export type RealtimePayload<T extends Record<string, unknown> = Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;

/**
 * Subscribes to Supabase Realtime INSERT, UPDATE, and DELETE events
 * on the given table, filtered by organization_id.
 *
 * The subscription is automatically cleaned up on unmount or when
 * the table / orgId changes.
 */
export function useRealtime<T extends Record<string, unknown>>(
  table: string,
  orgId: string | undefined,
  callback: (payload: RealtimePayload<T>) => void
) {
  const { supabase } = useUser();

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`realtime:${table}:${orgId}`)
      .on<T>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `organization_id=eq.${orgId}`,
        },
        callback
      )
      .on<T>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter: `organization_id=eq.${orgId}`,
        },
        callback
      )
      .on<T>(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
          filter: `organization_id=eq.${orgId}`,
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, table, orgId, callback]);
}
