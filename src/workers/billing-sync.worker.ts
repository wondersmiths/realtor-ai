import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getStripeClient } from '@/lib/stripe/client';
import type { BillingSyncJob } from '@/lib/queue/jobs';

/**
 * Billing sync processor.
 *
 * Pipeline:
 * 1. Aggregate ai_usage records for the specified billing period
 * 2. Sync metered usage to Stripe (if configured)
 * 3. Update billing records in the database
 */
export async function processBillingSync(job: Job<BillingSyncJob>): Promise<void> {
  const { orgId, period } = job.data;
  const supabase = getSupabaseAdmin();

  console.log(`[BillingSyncWorker] Syncing billing for org ${orgId}, period ${period}`);

  try {
    // Parse the period (expected format: "YYYY-MM")
    const [year, month] = period.split('-').map(Number);
    if (!year || !month) {
      throw new Error(`Invalid period format: ${period}. Expected YYYY-MM.`);
    }

    const periodStart = new Date(year, month - 1, 1).toISOString();
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    // 1. Aggregate AI usage for the period
    const { data: usageRecords, error: usageError } = await (supabase as any)
      .from('ai_usage')
      .select('operation, input_tokens, output_tokens, total_tokens, cost_cents, status')
      .eq('organization_id', orgId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (usageError) {
      throw new Error(`Failed to fetch AI usage: ${usageError.message}`);
    }

    const records = (usageRecords || []) as Array<{
      operation: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      cost_cents: number;
      status: string;
    }>;

    // Calculate aggregates
    const totals = records.reduce(
      (acc, r) => ({
        totalCalls: acc.totalCalls + 1,
        successCalls: acc.successCalls + (r.status === 'success' ? 1 : 0),
        totalInputTokens: acc.totalInputTokens + (r.input_tokens || 0),
        totalOutputTokens: acc.totalOutputTokens + (r.output_tokens || 0),
        totalTokens: acc.totalTokens + (r.total_tokens || 0),
        totalCostCents: acc.totalCostCents + (r.cost_cents || 0),
      }),
      {
        totalCalls: 0,
        successCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCostCents: 0,
      }
    );

    // Aggregate by operation
    const byOperation: Record<string, { calls: number; tokens: number; costCents: number }> = {};
    for (const r of records) {
      if (!byOperation[r.operation]) {
        byOperation[r.operation] = { calls: 0, tokens: 0, costCents: 0 };
      }
      byOperation[r.operation].calls += 1;
      byOperation[r.operation].tokens += r.total_tokens || 0;
      byOperation[r.operation].costCents += r.cost_cents || 0;
    }

    console.log(
      `[BillingSyncWorker] Org ${orgId}: ${totals.totalCalls} calls, ${totals.totalTokens} tokens, $${(totals.totalCostCents / 100).toFixed(2)} cost`
    );

    // 2. Sync to Stripe metered billing (if configured)
    const stripe = getStripeClient();

    if (stripe) {
      // Find the organization's Stripe subscription
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('stripe_subscription_id, stripe_customer_id')
        .eq('id', orgId)
        .single();

      if (org?.stripe_subscription_id && org?.stripe_customer_id) {
        try {
          // Report usage via Stripe's meter events (if using metered billing)
          // For standard subscription billing, we just log the usage.
          // This can be expanded to use Stripe Usage Records for metered plans.
          const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
          const meteredItem = subscription.items?.data?.find(
            (item) => item.price?.recurring?.usage_type === 'metered'
          );

          if (meteredItem) {
            // Report AI check usage via Stripe Billing Meter Events
            await stripe.billing.meterEvents.create({
              event_name: 'ai_compliance_checks',
              payload: {
                value: String(totals.successCalls),
                stripe_customer_id: org.stripe_customer_id!,
              },
              timestamp: Math.floor(new Date(periodEnd).getTime() / 1000),
            });

            console.log(
              `[BillingSyncWorker] Reported ${totals.successCalls} metered units to Stripe for org ${orgId}`
            );
          }
        } catch (stripeError) {
          // Non-fatal: log but continue
          console.warn(
            '[BillingSyncWorker] Failed to sync metered usage to Stripe:',
            stripeError instanceof Error ? stripeError.message : stripeError
          );
        }
      }
    }

    // 3. Update the org_ai_quota record with latest usage
    const { data: quota } = await (supabase as any)
      .from('org_ai_quota')
      .select('*')
      .eq('organization_id', orgId)
      .gte('period_end', periodStart)
      .lte('period_start', periodEnd)
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (quota) {
      await (supabase as any)
        .from('org_ai_quota')
        .update({
          used_ai_checks: totals.successCalls,
          used_tokens: totals.totalTokens,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quota.id);
    }

    console.log(`[BillingSyncWorker] Completed billing sync for org ${orgId}, period ${period}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BillingSyncWorker] Failed for org ${orgId}:`, message);
    throw error;
  }
}
