import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AuthService } from '@/services/auth.service';
import { AppError } from '@/lib/errors';

/**
 * POST /api/organizations
 * Create a new organization. The authenticated user becomes the owner.
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

    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json(
        {
          error: {
            message: 'Organization name is required',
            code: 'VALIDATION_ERROR',
            statusCode: 422,
            fieldErrors: { name: ['A non-empty name is required'] },
          },
        },
        { status: 422 }
      );
    }

    const authService = new AuthService(supabase);
    const result = await authService.createOrganization(user.id, body.name, body.slug);

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/organizations error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
