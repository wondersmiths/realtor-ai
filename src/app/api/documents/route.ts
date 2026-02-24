import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DocumentService } from '@/services/document.service';
import { AppError } from '@/lib/errors';
import type { DocumentStatus } from '@/types/enums';

/**
 * GET /api/documents
 * List documents for the organization with pagination, status filter, and search.
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
    const status = searchParams.get('status') as DocumentStatus | null;
    const search = searchParams.get('search') || undefined;
    const listingId = searchParams.get('listingId') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;

    const documentService = new DocumentService(supabase);
    const result = await documentService.list(orgId, {
      page,
      pageSize,
      status: status || undefined,
      search,
      listingId,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/documents error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents
 * Create a document record (metadata only, not file upload).
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

    // If a file path is provided directly (for records created outside upload flow)
    const { data, error: insertError } = await supabase
      .from('documents')
      .insert({
        organization_id: orgId,
        uploaded_by: user.id,
        name: body.name,
        file_path: body.file_path || '',
        file_type: body.file_type || 'application/octet-stream',
        file_size: body.file_size || 0,
        status: body.status || 'pending',
        listing_id: body.listing_id || null,
        metadata: body.metadata || {},
      })
      .select('*')
      .single();

    if (insertError || !data) {
      return NextResponse.json(
        { error: { message: `Failed to create document: ${insertError?.message}`, code: 'INTERNAL_ERROR', statusCode: 500 } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/documents error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
