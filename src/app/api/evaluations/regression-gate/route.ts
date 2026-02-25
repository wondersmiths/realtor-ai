import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { RegressionPipelineService } from '@/services/regression-pipeline.service';
import type { RegressionGateRequest } from '@/types/api';

/**
 * POST /api/evaluations/regression-gate
 *
 * Trigger a full regression gate: runs all detection types against the
 * labeled dataset, compares with previous results, and returns pass/fail.
 *
 * Used by CI pipelines and pre-deployment checks to block deploys
 * that degrade AI accuracy.
 *
 * Auth: either session-based (admin) or API key via x-api-key header.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Auth: try session first, then API key for CI usage
    const apiKey = request.headers.get('x-api-key');
    let userId: string;

    if (apiKey) {
      // CI/deploy auth via API key
      const expectedKey = process.env.REGRESSION_GATE_API_KEY;
      if (!expectedKey || apiKey !== expectedKey) {
        return NextResponse.json(
          { error: { message: 'Invalid API key', code: 'UNAUTHORIZED', statusCode: 401 } },
          { status: 401 },
        );
      }
      userId = 'ci-pipeline';
    } else {
      // Session-based auth
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json(
          { error: { message: 'Authentication required', code: 'UNAUTHORIZED', statusCode: 401 } },
          { status: 401 },
        );
      }
      userId = user.id;

      // Admin check for session-based calls
      const orgId = request.headers.get('x-org-id');
      if (orgId) {
        const { data: adminMembership } = await supabase
          .from('memberships')
          .select('id')
          .eq('user_id', user.id)
          .eq('organization_id', orgId)
          .in('role', ['admin', 'owner'])
          .is('deleted_at', null)
          .limit(1);

        if (!adminMembership || adminMembership.length === 0) {
          return NextResponse.json(
            { error: { message: 'Admin access required', code: 'FORBIDDEN', statusCode: 403 } },
            { status: 403 },
          );
        }
      }
    }

    const orgId = request.headers.get('x-org-id') || process.env.REGRESSION_GATE_ORG_ID;
    if (!orgId) {
      return NextResponse.json(
        { error: { message: 'Missing x-org-id header or REGRESSION_GATE_ORG_ID env', code: 'BAD_REQUEST', statusCode: 400 } },
        { status: 400 },
      );
    }

    const body = (await request.json()) as RegressionGateRequest;

    if (!body.triggered_by) {
      return NextResponse.json(
        { error: { message: 'triggered_by is required', code: 'VALIDATION_ERROR', statusCode: 422 } },
        { status: 422 },
      );
    }

    const pipeline = new RegressionPipelineService(supabase);
    const result = await pipeline.runGate(orgId, userId, body);

    // Return 200 for passed gate, 422 for blocked gate (so CI can check status code)
    const status = result.gate_passed ? 200 : 422;

    return NextResponse.json({ data: result }, { status });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/evaluations/regression-gate error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}

/**
 * GET /api/evaluations/regression-gate
 *
 * Returns regression history with deltas for the dashboard.
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
        { status: 401 },
      );
    }

    const orgId = request.headers.get('x-org-id');
    if (!orgId) {
      return NextResponse.json(
        { error: { message: 'Missing x-org-id header', code: 'BAD_REQUEST', statusCode: 400 } },
        { status: 400 },
      );
    }

    // Admin check
    const { data: adminMembership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .in('role', ['admin', 'owner'])
      .is('deleted_at', null)
      .limit(1);

    if (!adminMembership || adminMembership.length === 0) {
      return NextResponse.json(
        { error: { message: 'Admin access required', code: 'FORBIDDEN', statusCode: 403 } },
        { status: 403 },
      );
    }

    const pipeline = new RegressionPipelineService(supabase);
    const history = await pipeline.getRegressionHistory();

    return NextResponse.json({ data: history });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/evaluations/regression-gate error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}
