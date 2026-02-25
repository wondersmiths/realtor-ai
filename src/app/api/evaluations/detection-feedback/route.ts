import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { DetectionFeedbackService } from '@/services/detection-feedback.service';
import type { SubmitDetectionFeedbackRequest } from '@/types/api';

/**
 * GET /api/evaluations/detection-feedback
 *
 * List detection results for admin review, or fetch feedback stats.
 * Query params:
 *   mode=stats     — return aggregate feedback stats
 *   mode=results   — (default) list detection results
 *   mode=errors    — list logged detection errors
 *   page, pageSize, detection_type, reviewed (true|false|all), error_type, resolved
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

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') ?? 'results';
    const service = new DetectionFeedbackService(supabase);

    if (mode === 'stats') {
      const stats = await service.getFeedbackStats(orgId);
      return NextResponse.json({ data: stats });
    }

    if (mode === 'errors') {
      const page = parseInt(url.searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
      const error_type = url.searchParams.get('error_type') ?? undefined;
      const resolvedParam = url.searchParams.get('resolved');
      const resolved = resolvedParam !== null ? resolvedParam === 'true' : undefined;

      const result = await service.listDetectionErrors(orgId, { page, pageSize, error_type, resolved });
      return NextResponse.json(result);
    }

    // Default: list detection results
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const detection_type = url.searchParams.get('detection_type') ?? undefined;
    const reviewed = (url.searchParams.get('reviewed') ?? 'all') as 'true' | 'false' | 'all';

    const result = await service.listDetectionResults(orgId, { page, pageSize, detection_type, reviewed });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/evaluations/detection-feedback error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/evaluations/detection-feedback
 *
 * Submit feedback on a detection result.
 * Body:
 *   action=flag    — mark as false_positive or missed_signature
 *   action=confirm — mark detection as correct
 *   action=resolve — resolve a detection error (for rule improvement)
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

    const body = await request.json();
    const action = body.action as string;
    const service = new DetectionFeedbackService(supabase);

    if (action === 'flag') {
      const req = body as SubmitDetectionFeedbackRequest & { action: string };
      if (!req.detection_result_id || !req.error_type) {
        return NextResponse.json(
          { error: { message: 'detection_result_id and error_type are required', code: 'VALIDATION_ERROR', statusCode: 422 } },
          { status: 422 },
        );
      }
      if (req.error_type !== 'false_positive' && req.error_type !== 'missed_signature') {
        return NextResponse.json(
          { error: { message: 'error_type must be false_positive or missed_signature', code: 'VALIDATION_ERROR', statusCode: 422 } },
          { status: 422 },
        );
      }

      const result = await service.submitFeedback(orgId, user.id, req);
      return NextResponse.json({ data: result }, { status: 201 });
    }

    if (action === 'confirm') {
      if (!body.detection_result_id) {
        return NextResponse.json(
          { error: { message: 'detection_result_id is required', code: 'VALIDATION_ERROR', statusCode: 422 } },
          { status: 422 },
        );
      }
      const result = await service.confirmCorrect(orgId, user.id, body.detection_result_id);
      return NextResponse.json({ data: result });
    }

    if (action === 'resolve') {
      if (!body.error_id) {
        return NextResponse.json(
          { error: { message: 'error_id is required', code: 'VALIDATION_ERROR', statusCode: 422 } },
          { status: 422 },
        );
      }
      await service.resolveError(orgId, user.id, body.error_id, body.root_cause);
      return NextResponse.json({ data: { success: true } });
    }

    return NextResponse.json(
      { error: { message: 'action must be flag, confirm, or resolve', code: 'VALIDATION_ERROR', statusCode: 422 } },
      { status: 422 },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/evaluations/detection-feedback error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}
