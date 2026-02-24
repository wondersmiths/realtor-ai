import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ListingService } from '@/services/listing.service';
import { ComplianceService } from '@/services/compliance.service';
import { AIService } from '@/services/ai.service';
import { AppError } from '@/lib/errors';
import { ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';

/**
 * POST /api/listings/[id]/compliance-check
 * Request a compliance check for a listing.
 * Creates a compliance check record and optionally triggers AI analysis.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const listingService = new ListingService(supabase);
    const complianceService = new ComplianceService(supabase);
    const aiService = new AIService(supabase);

    // Create the compliance check record via the listing service
    const check = await listingService.requestComplianceCheck(
      orgId,
      id,
      user.id,
      ComplianceCheckType.ListingCompliance
    );

    // Fetch the full listing for AI analysis
    const listing = await listingService.getById(orgId, id);

    // Attempt AI-powered compliance check
    try {
      await complianceService.markRunning(check.id);

      const aiResult = await aiService.checkListingCompliance(orgId, user.id, listing);

      await complianceService.updateCheckResult(check.id, {
        status: ComplianceCheckStatus.Completed,
        score: aiResult.data.score,
        findings: aiResult.data.findings,
        summary: aiResult.data.summary,
        ai_used: aiResult.aiUsed,
        model_used: aiResult.model,
        tokens_used: aiResult.tokensUsed,
      });

      // Update the listing's compliance score
      await supabase
        .from('listings')
        .update({
          compliance_score: aiResult.data.score,
          last_compliance_check: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', orgId);
    } catch (aiError) {
      await complianceService.markFailed(
        check.id,
        aiError instanceof Error ? aiError.message : 'AI compliance check failed'
      );
    }

    // Return the updated check
    const updatedCheck = await complianceService.getCheckById(orgId, check.id);

    return NextResponse.json({ data: updatedCheck }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/listings/[id]/compliance-check error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
