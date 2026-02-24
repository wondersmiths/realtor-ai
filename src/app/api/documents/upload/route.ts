import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DocumentService } from '@/services/document.service';
import { AppError, ValidationError } from '@/lib/errors';

/**
 * POST /api/documents/upload
 * Handle multipart form file upload. Expects a 'file' field in the form data.
 * Optional fields: listingId, metadata (JSON string).
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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new ValidationError('No file provided', { file: ['A file is required'] });
    }

    // Validate file size (max 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError('File too large', {
        file: ['File must be smaller than 50MB'],
      });
    }

    const listingId = formData.get('listingId') as string | null;
    let metadata: Record<string, unknown> = {};
    const metadataStr = formData.get('metadata') as string | null;
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        throw new ValidationError('Invalid metadata JSON', {
          metadata: ['metadata must be a valid JSON string'],
        });
      }
    }

    const documentService = new DocumentService(supabase);
    const document = await documentService.upload(orgId, user.id, file, {
      listingId: listingId || undefined,
      metadata,
    });

    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/documents/upload error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
