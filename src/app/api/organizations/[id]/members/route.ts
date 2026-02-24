import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OrganizationService } from '@/services/organization.service';
import { AppError, ValidationError } from '@/lib/errors';
import type { UserRole } from '@/types/enums';

/**
 * GET /api/organizations/[id]/members
 * List members of an organization with pagination.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;

    const organizationService = new OrganizationService(supabase);
    const result = await organizationService.listMembers(orgId, {
      page,
      pageSize,
      search,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/organizations/[id]/members error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations/[id]/members
 * Invite a new member to the organization.
 * Body: { email: string, role: UserRole }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
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

    if (!body.email || typeof body.email !== 'string') {
      throw new ValidationError('Email is required', {
        email: ['A valid email address is required'],
      });
    }

    if (!body.role) {
      throw new ValidationError('Role is required', {
        role: ['A role (owner, admin, or agent) is required'],
      });
    }

    const organizationService = new OrganizationService(supabase);
    const membership = await organizationService.inviteMember(
      orgId,
      body.email,
      body.role as UserRole,
      user.id
    );

    return NextResponse.json({ data: membership }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/organizations/[id]/members error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
