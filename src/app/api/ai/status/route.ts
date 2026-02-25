import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AIService } from '@/services/ai.service';
import type { AICostLimit } from '@/types/database';

/**
 * GET /api/ai/status
 * Return the AI service status for the authenticated user's organization.
 * Response: { enabled: boolean, orgEnabled: boolean, quotaRemaining: number }
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

    // Check global AI_ENABLED env var
    const globalEnabled = process.env.AI_ENABLED !== 'false';

    // Check organization's ai_enabled flag
    let orgEnabled = false;
    const { data: org } = await supabase
      .from('organizations')
      .select('ai_enabled')
      .eq('id', orgId)
      .is('deleted_at', null)
      .single();

    if (org) {
      orgEnabled = org.ai_enabled === true;
    }

    // Check remaining AI quota
    let quotaRemaining = 0;
    const { data: quota } = await supabase
      .from('org_ai_quota')
      .select('max_ai_checks, used_ai_checks')
      .eq('organization_id', orgId)
      .gte('period_end', new Date().toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (quota) {
      quotaRemaining = Math.max(0, quota.max_ai_checks - quota.used_ai_checks);
    }

    // Fetch cache hit rate stats
    const aiService = new AIService(supabase);
    const cacheStats = await aiService.getCacheStats(orgId);

    // Compute cost pressure / active guardrail state
    let costPressure: {
      monthlySpentCents: number;
      monthlySoftLimitCents: number;
      monthlyHardLimitCents: number;
      spendPct: number;
      activeGuardrail: 'none' | 'model_downgrade' | 'advanced_features_disabled' | 'hard_block';
      advancedFeaturesEnabled: boolean;
    } | null = null;

    const { data: costLimitRow } = await supabase
      .from('ai_cost_limits')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (costLimitRow) {
      const costLimit = costLimitRow as AICostLimit;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: monthlyUsage } = await supabase
        .from('ai_usage')
        .select('cost_cents')
        .eq('organization_id', orgId)
        .gte('created_at', monthStart.toISOString());

      const monthlySpent = (monthlyUsage || []).reduce(
        (sum: number, row: { cost_cents: number }) => sum + (row.cost_cents || 0),
        0,
      );

      const softLimit = costLimit.monthly_soft_limit_cents;
      const hardLimit = costLimit.monthly_hard_limit_cents;
      const spendPct = softLimit > 0 ? Math.round((monthlySpent / softLimit) * 100) : 0;

      let activeGuardrail: 'none' | 'model_downgrade' | 'advanced_features_disabled' | 'hard_block' = 'none';
      if (costLimit.is_hard_limited && monthlySpent >= hardLimit) {
        activeGuardrail = 'hard_block';
      } else if (softLimit > 0 && spendPct >= 100) {
        activeGuardrail = 'advanced_features_disabled';
      } else if (softLimit > 0 && spendPct >= costLimit.alert_threshold_pct) {
        activeGuardrail = 'model_downgrade';
      }

      costPressure = {
        monthlySpentCents: monthlySpent,
        monthlySoftLimitCents: softLimit,
        monthlyHardLimitCents: hardLimit,
        spendPct,
        activeGuardrail,
        advancedFeaturesEnabled: activeGuardrail !== 'advanced_features_disabled' && activeGuardrail !== 'hard_block',
      };
    }

    return NextResponse.json({
      data: {
        enabled: globalEnabled && orgEnabled,
        orgEnabled,
        quotaRemaining,
        cache: cacheStats,
        costPressure,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/ai/status error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
