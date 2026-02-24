import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import type { BillingUsageResponse } from '@/types/api';

/**
 * GET /api/billing/usage
 * Get billing usage information for the organization.
 * Returns quota usage, cost breakdown, and percentage indicators.
 */
export async function GET(request: NextRequest) {
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

    // Fetch the active quota for this organization
    const { data: quota } = await supabase
      .from('org_ai_quota')
      .select('*')
      .eq('organization_id', orgId)
      .gte('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    // Fetch cost limits
    const { data: costLimit } = await supabase
      .from('ai_cost_limits')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    // Calculate current month's AI spending
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthlyUsage } = await supabase
      .from('ai_usage')
      .select('cost_cents')
      .eq('organization_id', orgId)
      .gte('created_at', monthStart.toISOString());

    const currentMonthCents = (monthlyUsage || []).reduce(
      (sum: number, row: { cost_cents: number }) => sum + (row.cost_cents || 0),
      0
    );

    // Calculate today's spending
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { data: dailyUsage } = await supabase
      .from('ai_usage')
      .select('cost_cents')
      .eq('organization_id', orgId)
      .gte('created_at', dayStart.toISOString());

    const dailySpendCents = (dailyUsage || []).reduce(
      (sum: number, row: { cost_cents: number }) => sum + (row.cost_cents || 0),
      0
    );

    // Build response
    const safeDiv = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

    const response: BillingUsageResponse = {
      quota: {
        max_ai_checks: quota?.max_ai_checks ?? 0,
        used_ai_checks: quota?.used_ai_checks ?? 0,
        max_tokens: quota?.max_tokens ?? 0,
        used_tokens: quota?.used_tokens ?? 0,
        max_documents: quota?.max_documents ?? 0,
        used_documents: quota?.used_documents ?? 0,
        max_storage_bytes: quota?.max_storage_bytes ?? 0,
        used_storage_bytes: quota?.used_storage_bytes ?? 0,
        period_start: quota?.period_start ?? '',
        period_end: quota?.period_end ?? '',
      },
      cost: {
        current_month_cents: currentMonthCents,
        monthly_soft_limit_cents: costLimit?.monthly_soft_limit_cents ?? 0,
        monthly_hard_limit_cents: costLimit?.monthly_hard_limit_cents ?? 0,
        daily_spend_cents: dailySpendCents,
        daily_hard_limit_cents: costLimit?.daily_hard_limit_cents ?? 0,
      },
      percentages: {
        ai_checks: safeDiv(quota?.used_ai_checks ?? 0, quota?.max_ai_checks ?? 0),
        tokens: safeDiv(quota?.used_tokens ?? 0, quota?.max_tokens ?? 0),
        documents: safeDiv(quota?.used_documents ?? 0, quota?.max_documents ?? 0),
        storage: safeDiv(quota?.used_storage_bytes ?? 0, quota?.max_storage_bytes ?? 0),
        monthly_cost: safeDiv(currentMonthCents, costLimit?.monthly_hard_limit_cents ?? 0),
      },
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/billing/usage error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
