import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

interface OrgAccum {
  spendCents: number;
  requests: number;
}

interface OpAccum {
  spendCents: number;
  requests: number;
  totalLatency: number;
  count: number;
}

interface DayAccum {
  inputTokens: number;
  outputTokens: number;
  requests: number;
  spendCents: number;
}

export async function GET() {
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

    // Admin check: user must have admin or owner role in at least one org
    const { data: adminMembership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .in('role', ['admin', 'owner'])
      .is('deleted_at', null)
      .limit(1);

    if (!adminMembership || adminMembership.length === 0) {
      return NextResponse.json(
        { error: { message: 'Admin access required', code: 'FORBIDDEN', statusCode: 403 } },
        { status: 403 }
      );
    }

    // Compute month start
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Parallel fetch
    const [usageResult, orgsResult, quotaResult] = await Promise.all([
      supabase
        .from('ai_usage')
        .select('organization_id, operation, input_tokens, output_tokens, total_tokens, cost_cents, latency_ms, status, request_metadata, created_at')
        .gte('created_at', monthStart.toISOString())
        .limit(10000),
      supabase
        .from('organizations')
        .select('id, name')
        .is('deleted_at', null),
      supabase
        .from('org_ai_quota')
        .select('organization_id, used_credits, max_credits')
        .gte('period_end', new Date().toISOString()),
    ]);

    const usageRows = usageResult.data || [];
    const orgs = orgsResult.data || [];
    const quotaRows = quotaResult.data || [];

    // Build org name map
    const orgNameMap = new Map<string, string>();
    for (const org of orgs) {
      orgNameMap.set(org.id, org.name);
    }

    // Single pass aggregation
    const orgAccum = new Map<string, OrgAccum>();
    const opAccum = new Map<string, OpAccum>();
    const dayAccum = new Map<string, DayAccum>();

    let totalSpendCents = 0;
    let totalRequests = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let errorCount = 0;
    let cacheSuccessCount = 0;
    let cacheHitCount = 0;

    for (const row of usageRows) {
      const costCents = row.cost_cents || 0;
      const tokens = row.total_tokens || 0;
      const latency = row.latency_ms || 0;
      const inputTokens = row.input_tokens || 0;
      const outputTokens = row.output_tokens || 0;

      totalSpendCents += costCents;
      totalRequests += 1;
      totalTokens += tokens;
      totalLatency += latency;

      if (row.status === 'error') {
        errorCount += 1;
      }

      if (row.status === 'success') {
        cacheSuccessCount += 1;
        const metadata = row.request_metadata as Record<string, unknown> | null;
        if (metadata?.cached === true) {
          cacheHitCount += 1;
        }
      }

      // Org accumulator
      const orgId = row.organization_id;
      if (orgId) {
        const existing = orgAccum.get(orgId);
        if (existing) {
          existing.spendCents += costCents;
          existing.requests += 1;
        } else {
          orgAccum.set(orgId, { spendCents: costCents, requests: 1 });
        }
      }

      // Operation accumulator
      const op = row.operation || 'unknown';
      const existingOp = opAccum.get(op);
      if (existingOp) {
        existingOp.spendCents += costCents;
        existingOp.requests += 1;
        existingOp.totalLatency += latency;
        existingOp.count += 1;
      } else {
        opAccum.set(op, { spendCents: costCents, requests: 1, totalLatency: latency, count: 1 });
      }

      // Day accumulator
      const day = row.created_at ? row.created_at.substring(0, 10) : 'unknown';
      const existingDay = dayAccum.get(day);
      if (existingDay) {
        existingDay.inputTokens += inputTokens;
        existingDay.outputTokens += outputTokens;
        existingDay.requests += 1;
        existingDay.spendCents += costCents;
      } else {
        dayAccum.set(day, { inputTokens, outputTokens, requests: 1, spendCents: costCents });
      }
    }

    // Build sorted arrays
    const spendByOrg = Array.from(orgAccum.entries())
      .map(([orgId, data]) => ({
        orgId,
        orgName: orgNameMap.get(orgId) || orgId,
        spendCents: data.spendCents,
        requests: data.requests,
      }))
      .sort((a, b) => b.spendCents - a.spendCents);

    const spendByOperation = Array.from(opAccum.entries())
      .map(([operation, data]) => ({
        operation,
        spendCents: data.spendCents,
        requests: data.requests,
        avgLatencyMs: data.count > 0 ? Math.round(data.totalLatency / data.count) : 0,
      }))
      .sort((a, b) => b.spendCents - a.spendCents);

    const dailyTrends = Array.from(dayAccum.entries())
      .map(([date, data]) => ({
        date,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        requests: data.requests,
        spendCents: data.spendCents,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const cacheStats = {
      totalRequests: cacheSuccessCount,
      cacheHits: cacheHitCount,
      hitRate: cacheSuccessCount > 0 ? Math.round((cacheHitCount / cacheSuccessCount) * 100) : 0,
    };

    const creditUsage = quotaRows.map((row) => {
      const used = row.used_credits || 0;
      const max = row.max_credits || 0;
      return {
        orgId: row.organization_id,
        orgName: orgNameMap.get(row.organization_id) || row.organization_id,
        usedCredits: used,
        maxCredits: max,
        pct: max > 0 ? Math.round((used / max) * 100) : 0,
      };
    });

    return NextResponse.json({
      data: {
        totalSpendCents,
        totalRequests,
        totalTokens,
        avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
        errorCount,
        spendByOrg,
        spendByOperation,
        dailyTrends,
        cacheStats,
        creditUsage,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/admin/ai-analytics error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
