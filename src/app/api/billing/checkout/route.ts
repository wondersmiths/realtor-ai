import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BillingService } from '@/services/billing.service';
import { AppError, ValidationError } from '@/lib/errors';
import { PlanTier } from '@/types/enums';

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout session for subscribing to a plan.
 * Body: { plan: PlanTier, successUrl?: string, cancelUrl?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { message: 'Authentication required', code: 'UNAUTHORIZED', statusCode: 401 } },
        { status: 401 }
      );
    }

    const orgId = request.headers.get('x-org-id');
    if (!orgId) {
      return NextResponse.json(
        { error: { message: 'Missing x-org-id header', code: 'BAD_REQUEST', statusCode: 400 } },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body.plan) {
      throw new ValidationError('Plan is required', {
        plan: ['A plan tier is required'],
      });
    }

    const validPlans = Object.values(PlanTier);
    if (!validPlans.includes(body.plan)) {
      throw new ValidationError(`Invalid plan. Must be one of: ${validPlans.join(', ')}`, {
        plan: [`Must be one of: ${validPlans.join(', ')}`],
      });
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = body.successUrl || `${origin}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancelUrl || `${origin}/dashboard/billing?canceled=true`;

    const billingService = new BillingService(supabase);
    const session = await billingService.createCheckoutSession(
      orgId,
      body.plan as PlanTier,
      successUrl,
      cancelUrl
    );

    return NextResponse.json({ data: session });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/billing/checkout error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
