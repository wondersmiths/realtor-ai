import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/stripe/config';

/**
 * POST /api/cron/reset-credits
 * Monthly cron job that resets AI usage credits for all organizations.
 * Scheduled via Vercel Cron (1st of each month at midnight UTC).
 *
 * Requires `Authorization: Bearer <CRON_SECRET>` header.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED', statusCode: 401 } },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch all orgs with their plan tier and active quota
    const { data: orgs, error: orgsError } = await (supabase as any)
      .from('organizations')
      .select('id, plan_tier')
      .is('deleted_at', null);

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    let updated = 0;
    let skipped = 0;

    for (const org of orgs || []) {
      const plan = PLANS[org.plan_tier];
      const maxCredits = plan?.limits.credits ?? 10;

      const { error: updateError } = await (supabase as any)
        .from('org_ai_quota')
        .update({
          used_credits: 0,
          used_ai_checks: 0,
          used_tokens: 0,
          max_credits: maxCredits,
          period_start: periodStart,
          period_end: periodEnd,
          updated_at: now.toISOString(),
        })
        .eq('organization_id', org.id);

      if (updateError) {
        skipped++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      data: {
        updated,
        skipped,
        total: (orgs || []).length,
        period_start: periodStart,
        period_end: periodEnd,
      },
    });
  } catch (error) {
    console.error('[Cron] reset-credits error:', error);
    return NextResponse.json(
      { error: { message: 'Cron job failed', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
