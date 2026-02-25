import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AuditService } from '@/services/audit.service';
import { AuditAction } from '@/types/enums';
import { AppError } from '@/lib/errors';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const body = await request.json();
    const { status, reason } = body as { status?: string; reason?: string };

    if (!status || !['dismissed', 'resolved'].includes(status)) {
      return NextResponse.json(
        { error: { message: 'Invalid status. Must be "dismissed" or "resolved".', code: 'VALIDATION_ERROR', statusCode: 422 } },
        { status: 422 },
      );
    }

    // Build update payload
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = { status };

    if (status === 'dismissed') {
      updatePayload.dismissed_at = now;
      updatePayload.dismissed_by = user.id;
    } else {
      updatePayload.resolved_at = now;
      updatePayload.resolved_by = user.id;
    }

    if (reason) {
      updatePayload.metadata = { reason };
    }

    const { data: flag, error: updateError } = await supabase
      .from('anomaly_flags')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: { message: 'Anomaly flag not found', code: 'NOT_FOUND', statusCode: 404 } },
          { status: 404 },
        );
      }
      throw new AppError(`Failed to update anomaly flag: ${updateError.message}`);
    }

    // Audit log
    const audit = new AuditService(supabase);
    await audit.log({
      organizationId: (flag as Record<string, unknown>).organization_id as string,
      userId: user.id,
      action: status === 'dismissed' ? AuditAction.AnomalyDismissed : AuditAction.AnomalyResolved,
      resourceType: 'anomaly_flag',
      resourceId: id,
      metadata: { status, reason: reason || null },
    });

    return NextResponse.json({ data: flag });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] PATCH /api/admin/anomaly-flags/[id] error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 },
    );
  }
}
