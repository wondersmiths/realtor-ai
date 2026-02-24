import 'server-only';

import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Organization, Subscription, OrganizationAIQuota } from '@/types/database';
import { PlanTier, SubscriptionStatus } from '@/types/enums';
import { AppError, NotFoundError, QuotaExceededError } from '@/lib/errors';

/**
 * Stripe price IDs mapped by plan tier.
 * These should be configured in your Stripe dashboard.
 */
const PLAN_PRICE_IDS: Record<string, string> = {
  [PlanTier.Starter]: process.env.STRIPE_PRICE_STARTER || '',
  [PlanTier.Professional]: process.env.STRIPE_PRICE_PROFESSIONAL || '',
  [PlanTier.Enterprise]: process.env.STRIPE_PRICE_ENTERPRISE || '',
};

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new AppError('Stripe is not configured', 500, 'STRIPE_NOT_CONFIGURED');
  }
  return new Stripe(key, { apiVersion: '2026-01-28.clover' });
}

export class BillingService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a Stripe Checkout session for upgrading or starting a subscription.
   */
  async createCheckoutSession(
    orgId: string,
    plan: PlanTier,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    const stripe = getStripeClient();

    const org = await this.getOrganization(orgId);

    const priceId = PLAN_PRICE_IDS[plan];
    if (!priceId) {
      throw new AppError(`No Stripe price configured for plan: ${plan}`, 400, 'INVALID_PLAN');
    }

    // Retrieve or create the Stripe customer
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          organization_id: orgId,
          organization_name: org.name,
        },
      });
      customerId = customer.id;

      // Store the customer ID on the organization
      await this.supabase
        .from('organizations')
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organization_id: orgId,
        plan,
      },
    });

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  /**
   * Create a Stripe Customer Portal session for managing subscriptions.
   */
  async createPortalSession(
    orgId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    const stripe = getStripeClient();
    const org = await this.getOrganization(orgId);

    if (!org.stripe_customer_id) {
      throw new AppError('No Stripe customer found for this organization', 400, 'NO_STRIPE_CUSTOMER');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Synchronize subscription data from a Stripe webhook event.
   * Called when processing Stripe webhook events (e.g., customer.subscription.updated).
   */
  async syncSubscription(
    stripeSubscription: Stripe.Subscription
  ): Promise<Subscription> {
    const orgId = stripeSubscription.metadata?.organization_id;
    if (!orgId) {
      throw new AppError('Missing organization_id in subscription metadata');
    }

    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.Active,
      past_due: SubscriptionStatus.PastDue,
      canceled: SubscriptionStatus.Canceled,
      trialing: SubscriptionStatus.Trialing,
      incomplete: SubscriptionStatus.Incomplete,
      paused: SubscriptionStatus.Paused,
    };

    const planTier = (stripeSubscription.metadata?.plan as PlanTier) || PlanTier.Starter;
    const mappedStatus = statusMap[stripeSubscription.status] || SubscriptionStatus.Incomplete;

    // In Stripe SDK v20+, current_period_start/end moved to subscription items.
    // Extract period from the first subscription item, or fall back to start_date.
    const firstItem = stripeSubscription.items?.data?.[0];
    const periodStart = firstItem?.current_period_start ?? stripeSubscription.start_date;
    const periodEnd = firstItem?.current_period_end ?? stripeSubscription.start_date;

    // Upsert subscription record
    const { data: subscription, error: subError } = await this.supabase
      .from('subscriptions')
      .upsert(
        {
          organization_id: orgId,
          stripe_subscription_id: stripeSubscription.id,
          stripe_customer_id:
            typeof stripeSubscription.customer === 'string'
              ? stripeSubscription.customer
              : stripeSubscription.customer.id,
          plan_tier: planTier,
          status: mappedStatus,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at: stripeSubscription.cancel_at
            ? new Date(stripeSubscription.cancel_at * 1000).toISOString()
            : null,
          canceled_at: stripeSubscription.canceled_at
            ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
            : null,
          trial_start: stripeSubscription.trial_start
            ? new Date(stripeSubscription.trial_start * 1000).toISOString()
            : null,
          trial_end: stripeSubscription.trial_end
            ? new Date(stripeSubscription.trial_end * 1000).toISOString()
            : null,
          metadata: stripeSubscription.metadata || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      )
      .select('*')
      .single();

    if (subError || !subscription) {
      throw new AppError(`Failed to sync subscription: ${subError?.message}`);
    }

    // Update the organization record
    await this.supabase
      .from('organizations')
      .update({
        stripe_subscription_id: stripeSubscription.id,
        plan_tier: planTier,
        subscription_status: mappedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    return subscription as Subscription;
  }

  /**
   * Check whether the organization has remaining quota for a given resource type.
   * Returns the quota record if within limits. Throws QuotaExceededError otherwise.
   */
  async checkQuota(
    orgId: string,
    resource: 'ai_checks' | 'tokens' | 'documents' | 'storage_bytes',
    amount = 1
  ): Promise<OrganizationAIQuota> {
    const { data: quota, error } = await this.supabase
      .from('org_ai_quota')
      .select('*')
      .eq('organization_id', orgId)
      .gte('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (error || !quota) {
      throw new NotFoundError('No active quota period found for this organization');
    }

    const typedQuota = quota as OrganizationAIQuota;

    const fieldMap: Record<string, { max: keyof OrganizationAIQuota; used: keyof OrganizationAIQuota }> = {
      ai_checks: { max: 'max_ai_checks', used: 'used_ai_checks' },
      tokens: { max: 'max_tokens', used: 'used_tokens' },
      documents: { max: 'max_documents', used: 'used_documents' },
      storage_bytes: { max: 'max_storage_bytes', used: 'used_storage_bytes' },
    };

    const fields = fieldMap[resource];
    if (!fields) {
      throw new AppError(`Unknown resource type: ${resource}`, 400, 'INVALID_RESOURCE');
    }

    const maxVal = typedQuota[fields.max] as number;
    const usedVal = typedQuota[fields.used] as number;

    if (usedVal + amount > maxVal) {
      throw new QuotaExceededError(
        `${resource} quota exceeded (${usedVal + amount} / ${maxVal})`,
        maxVal,
        usedVal
      );
    }

    return typedQuota;
  }

  /**
   * Increment usage counters in the org_ai_quota table.
   */
  async incrementUsage(
    orgId: string,
    increments: {
      ai_checks?: number;
      tokens?: number;
      documents?: number;
      storage_bytes?: number;
    }
  ): Promise<void> {
    // Find the active quota period
    const { data: quota, error: fetchError } = await this.supabase
      .from('org_ai_quota')
      .select('*')
      .eq('organization_id', orgId)
      .gte('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !quota) {
      // No quota record - skip incrementing (org may be on free tier)
      return;
    }

    const typedQuota = quota as OrganizationAIQuota;

    const updates: Record<string, number> = {};

    if (increments.ai_checks) {
      updates.used_ai_checks = typedQuota.used_ai_checks + increments.ai_checks;
    }
    if (increments.tokens) {
      updates.used_tokens = typedQuota.used_tokens + increments.tokens;
    }
    if (increments.documents) {
      updates.used_documents = typedQuota.used_documents + increments.documents;
    }
    if (increments.storage_bytes) {
      updates.used_storage_bytes = typedQuota.used_storage_bytes + increments.storage_bytes;
    }

    if (Object.keys(updates).length === 0) return;

    const { error: updateError } = await this.supabase
      .from('org_ai_quota')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', typedQuota.id);

    if (updateError) {
      throw new AppError(`Failed to increment usage: ${updateError.message}`);
    }
  }

  /**
   * Internal helper to fetch the organization.
   */
  private async getOrganization(orgId: string): Promise<Organization> {
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
}
