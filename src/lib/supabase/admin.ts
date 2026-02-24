import { createClient } from '@supabase/supabase-js';

// WARNING: This client uses the service-role key and bypasses Row Level Security (RLS).
// Only use this in trusted server-side contexts such as webhooks, background jobs,
// or admin operations. NEVER expose this client or the service-role key to the browser.

let adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return adminClient;
}

// Use getSupabaseAdmin() instead of a top-level constant
// to avoid errors at build time when env vars are not available.
