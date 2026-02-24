import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ComplianceService } from '@/services/compliance.service';
import { AppError } from '@/lib/errors';
import type { ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';

/**
 * GET /api/compliance/checks
 * List compliance checks for the organization with pagination and filters.
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const checkType = searchParams.get('checkType') as ComplianceCheckType | null;
    const status = searchParams.get('status') as ComplianceCheckStatus | null;
    const listingId = searchParams.get('listingId') || undefined;
    const documentId = searchParams.get('documentId') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;

    const complianceService = new ComplianceService(supabase);
    const result = await complianceService.getChecks(orgId, {
      page,
      pageSize,
      checkType: checkType || undefined,
      status: status || undefined,
      listingId,
      documentId,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/compliance/checks error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
