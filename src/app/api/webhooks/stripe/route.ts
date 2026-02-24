import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { BillingService } from '@/services/billing.service';
import { AppError } from '@/lib/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * Helper to extract subscription ID from an invoice object.
 * In newer Stripe SDK versions, `subscription` may live under
 * `parent?.subscription_details?.subscription` instead of the top-level field.
 */
function getInvoiceSubscriptionId(invoice: Record<string, unknown>): string | null {
  // Try the modern path first (Stripe v2024+)
  const parent = invoice.parent as Record<string, unknown> | undefined;
  if (parent) {
    const subDetails = parent.subscription_details as Record<string, unknown> | undefined;
    if (subDetails?.subscription) {
      const sub = subDetails.subscription;
      return typeof sub === 'string' ? sub : (sub as { id: string }).id;
    }
  }

  // Fallback to legacy top-level field
  if (invoice.subscription) {
    const sub = invoice.subscription;
    return typeof sub === 'string' ? sub : (sub as { id: string }).id;
  }

  return null;
}

/**
 * POST /api/webhooks/stripe
 * Handle incoming Stripe webhook events.
 * Verifies the webhook signature using the STRIPE_WEBHOOK_SECRET,
 * then processes supported events idempotently.
 *
 * NOTE: This route does NOT use the session-based Supabase client.
 * It uses the admin (service-role) client because webhooks are server-to-server
 * and do not carry user authentication cookies.
 */
export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      console.error('[Webhook] Stripe keys not configured');
      return NextResponse.json(
        { error: { message: 'Webhook not configured', code: 'WEBHOOK_NOT_CONFIGURED', statusCode: 500 } },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' });

    // Read the raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: { message: 'Missing stripe-signature header', code: 'BAD_REQUEST', statusCode: 400 } },
        { status: 400 }
      );
    }

    // Verify the webhook signature
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature verification failed';
      console.error('[Webhook] Signature verification failed:', message);
      return NextResponse.json(
        { error: { message: `Webhook signature verification failed: ${message}`, code: 'INVALID_SIGNATURE', statusCode: 400 } },
        { status: 400 }
      );
    }

    // Use the admin Supabase client (bypasses RLS) for webhook processing
    const supabaseAdmin: SupabaseAdminClient = getSupabaseAdmin();

    // Idempotency check: ensure we haven't already processed this event
    const { data: existingEvent } = await (supabaseAdmin as any)
      .from('billing_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existingEvent) {
      // Already processed - return 200 to acknowledge
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Record the event for idempotency
    await (supabaseAdmin as any).from('billing_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: JSON.parse(JSON.stringify(event.data.object)),
      processed_at: new Date().toISOString(),
    });

    const billingService = new BillingService(supabaseAdmin as any);

    // Handle supported event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // If the checkout has a subscription, sync it
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          );
          await billingService.syncSubscription(subscription);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await billingService.syncSubscription(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await billingService.syncSubscription(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          // Find the organization by subscription ID
          const { data: org } = await (supabaseAdmin as any)
            .from('organizations')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (org) {
            await (supabaseAdmin as any).from('audit_logs').insert({
              organization_id: org.id,
              action: 'billing.payment_succeeded',
              resource_type: 'subscription',
              resource_id: subscriptionId,
              metadata: {
                amount_paid: invoice.amount_paid,
                currency: invoice.currency,
                invoice_id: invoice.id,
              },
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          const { data: org } = await (supabaseAdmin as any)
            .from('organizations')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (org) {
            await (supabaseAdmin as any).from('audit_logs').insert({
              organization_id: org.id,
              action: 'billing.payment_failed',
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
        }
        break;
      }

      default:
        // Unhandled event type - log but do not error
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[Webhook] Stripe webhook error:', error);
    return NextResponse.json(
      { error: { message: 'Webhook processing failed', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
