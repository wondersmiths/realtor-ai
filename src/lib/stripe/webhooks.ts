import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { BillingService } from '@/services/billing.service';
import { AuditAction, PlanTier, SubscriptionStatus } from '@/types/enums';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

/**
 * Extract subscription ID from a Stripe invoice.
 * Handles both the modern (v2024+) nested path and the legacy top-level field.
 */
function getInvoiceSubscriptionId(invoice: Record<string, unknown>): string | null {
  const parent = invoice.parent as Record<string, unknown> | undefined;
  if (parent) {
    const subDetails = parent.subscription_details as Record<string, unknown> | undefined;
    if (subDetails?.subscription) {
      const sub = subDetails.subscription;
      return typeof sub === 'string' ? sub : (sub as { id: string }).id;
    }
  }
  if (invoice.subscription) {
    const sub = invoice.subscription;
    return typeof sub === 'string' ? sub : (sub as { id: string }).id;
  }
  return null;
}

/**
 * Find the organization associated with a Stripe subscription.
 */
async function findOrgBySubscription(
  supabase: SupabaseAdmin,
  subscriptionId: string
): Promise<{ id: string } | null> {
  const { data } = await (supabase as any)
    .from('organizations')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();
  return data;
}

// ──────────────────────────────────────────────
// Event handlers
// ──────────────────────────────────────────────

/**
 * Handle checkout.session.completed
 * Retrieves the subscription from Stripe and syncs it to the database.
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  supabase: SupabaseAdmin
): Promise<void> {
  if (!session.subscription) return;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const billingService = new BillingService(supabase as any);
  await billingService.syncSubscription(subscription);
}

/**
 * Handle customer.subscription.updated
 * Syncs the updated subscription state to the database.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdmin
): Promise<void> {
  const billingService = new BillingService(supabase as any);
  await billingService.syncSubscription(subscription);
}

/**
 * Handle customer.subscription.deleted
 * Syncs the canceled subscription and downgrades the org to the free plan.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdmin
): Promise<void> {
  const billingService = new BillingService(supabase as any);
  await billingService.syncSubscription(subscription);

  // Downgrade the organization to the free tier
  const orgId = subscription.metadata?.organization_id;
  if (orgId) {
    await (supabase as any)
      .from('organizations')
      .update({
        plan_tier: PlanTier.Free,
        subscription_status: SubscriptionStatus.Canceled,
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);
  }
}

/**
 * Handle invoice.payment_succeeded
 * Logs the successful payment in the audit trail.
 */
export async function handleInvoicePaid(
  invoice: Record<string, unknown>,
  supabase: SupabaseAdmin
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const org = await findOrgBySubscription(supabase, subscriptionId);
  if (!org) return;

  await (supabase as any).from('audit_logs').insert({
    organization_id: org.id,
    action: AuditAction.PaymentSucceeded,
    resource_type: 'subscription',
    resource_id: subscriptionId,
    metadata: {
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      invoice_id: invoice.id,
    },
  });
}

/**
 * Handle invoice.payment_failed
 * Logs the failed payment in the audit trail.
 */
export async function handleInvoiceFailed(
  invoice: Record<string, unknown>,
  supabase: SupabaseAdmin
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const org = await findOrgBySubscription(supabase, subscriptionId);
  if (!org) return;

  await (supabase as any).from('audit_logs').insert({
    organization_id: org.id,
    action: AuditAction.PaymentFailed,
    resource_type: 'subscription',
    resource_id: subscriptionId,
    metadata: {
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      invoice_id: invoice.id,
      attempt_count: invoice.attempt_count,
    },
  });
}
