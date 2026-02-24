import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DocumentService } from '@/services/document.service';
import { ComplianceService } from '@/services/compliance.service';
import { AIService } from '@/services/ai.service';
import { AppError } from '@/lib/errors';
import { ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';

/**
 * POST /api/documents/[id]/review
 * Request an AI review of a document. Creates a compliance check record and
 * transitions the document to "reviewing" status.
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

    const documentService = new DocumentService(supabase);
    const complianceService = new ComplianceService(supabase);
    const aiService = new AIService(supabase);

    // Transition document to reviewing status
    const document = await documentService.requestReview(orgId, id);

    // Create a compliance check record
    const check = await complianceService.runCheck(orgId, user.id, {
      check_type: ComplianceCheckType.DocumentReview,
      document_id: id,
      input_text: document.extracted_text || undefined,
    });

    // If extracted text is available, trigger AI review
    if (document.extracted_text) {
      try {
        await complianceService.markRunning(check.id);

        const aiResult = await aiService.reviewDocument(orgId, user.id, document.extracted_text);

        await complianceService.updateCheckResult(check.id, {
          status: ComplianceCheckStatus.Completed,
          score: aiResult.data.score,
          findings: aiResult.data.findings,
          summary: aiResult.data.summary,
          ai_used: aiResult.aiUsed,
          model_used: aiResult.model,
          tokens_used: aiResult.tokensUsed,
        });

        // Update the document with review results
        await supabase
          .from('documents')
          .update({
            review_score: aiResult.data.score,
            review_findings: aiResult.data.findings,
            reviewed_at: new Date().toISOString(),
            status: aiResult.data.score >= 70 ? 'reviewed' : 'flagged',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', orgId);
      } catch (aiError) {
        // Mark the check as failed but do not fail the overall request
        await complianceService.markFailed(
          check.id,
          aiError instanceof Error ? aiError.message : 'AI review failed'
        );
      }
    }

    // Fetch the updated check
    const updatedCheck = await complianceService.getCheckById(orgId, check.id);

    return NextResponse.json({ data: updatedCheck }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/documents/[id]/review error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
