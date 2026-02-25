import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

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

    // Admin check
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
        { status: 403 },
      );
    }

    // Parse query params
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const offset = (page - 1) * pageSize;

    // Count query
    let countQuery = supabase
      .from('anomaly_flags')
      .select('id', { count: 'exact', head: true });
    if (status) countQuery = countQuery.eq('status', status);
    if (type) countQuery = countQuery.eq('anomaly_type', type);

    const { count } = await countQuery;
    const total = count ?? 0;

    // Data query with org join
    let dataQuery = supabase
      .from('anomaly_flags')
      .select('*, organizations(id, name, slug)')
      .order('detected_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (status) dataQuery = dataQuery.eq('status', status);
    if (type) dataQuery = dataQuery.eq('anomaly_type', type);

    const { data: flags, error: flagsError } = await dataQuery;
    if (flagsError) {
      throw new AppError(`Failed to fetch anomaly flags: ${flagsError.message}`);
    }

    // Reshape org join
    const items = (flags || []).map((f) => {
      const { organizations, ...rest } = f as Record<string, unknown>;
      return { ...rest, organization: organizations || null };
    });

    // Summary counts
    const { data: summaryRows } = await supabase
      .from('anomaly_flags')
      .select('status, anomaly_type');

    const summary = { open: 0, dismissed: 0, resolved: 0, by_type: {} as Record<string, number> };
    for (const row of summaryRows || []) {
      const s = row.status as string;
      if (s === 'open') summary.open++;
      else if (s === 'dismissed') summary.dismissed++;
      else if (s === 'resolved') summary.resolved++;

      const t = row.anomaly_type as string;
      summary.by_type[t] = (summary.by_type[t] || 0) + 1;
    }

    return NextResponse.json({
      data: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] GET /api/admin/anomaly-flags error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}
