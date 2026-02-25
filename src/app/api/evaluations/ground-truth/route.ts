import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { LabeledDatasetService } from '@/services/labeled-dataset.service';
import type { CreateGroundTruthRequest } from '@/types/api';

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
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const document_type = url.searchParams.get('document_type') ?? undefined;
    const is_active_param = url.searchParams.get('is_active');
    const is_active = is_active_param !== null ? is_active_param === 'true' : undefined;

    const service = new LabeledDatasetService(supabase);
    const result = await service.listGroundTruth(orgId, { page, pageSize, document_type, is_active });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/evaluations/ground-truth error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}

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

    const body = (await request.json()) as CreateGroundTruthRequest;

    if (!body.document_type || !body.input_text || !body.expected_findings) {
      return NextResponse.json(
        { error: { message: 'document_type, input_text, and expected_findings are required', code: 'VALIDATION_ERROR', statusCode: 422 } },
        { status: 422 },
      );
    }

    const service = new LabeledDatasetService(supabase);
    const doc = await service.createGroundTruth(orgId, user.id, body);

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/evaluations/ground-truth error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}
