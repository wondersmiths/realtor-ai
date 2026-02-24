import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIService } from '@/services/ai.service';
import { ComplianceService } from '@/services/compliance.service';
import { DocumentStatus, ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';
import { enqueueNotification } from '@/lib/queue/producer';
import type { DocumentReviewJob } from '@/lib/queue/jobs';

/**
 * Document review processor.
 *
 * Pipeline:
 * 1. Download the file from Supabase Storage
 * 2. Extract text based on file type (PDF, DOCX, TXT)
 * 3. Run AI-powered compliance review via AIService
 * 4. Save results to the documents table
 * 5. Create or update a compliance_check record
 * 6. Enqueue a notification if issues were found
 */
export async function processDocumentReview(job: Job<DocumentReviewJob>): Promise<void> {
  const { documentId, orgId, userId, filePath } = job.data;
  const supabase = getSupabaseAdmin();

  console.log(`[DocumentReviewWorker] Processing document ${documentId}`);

  // Mark document as reviewing
  await (supabase as any)
    .from('documents')
    .update({
      status: DocumentStatus.Reviewing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  let extractedText = '';

  try {
    // 1. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await (supabase as any).storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'No data'}`);
    }

    // 2. Extract text based on file type
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    const buffer = Buffer.from(await (fileData as Blob).arrayBuffer());

    if (extension === 'pdf') {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const pdfResult = await pdfParse(buffer);
      extractedText = pdfResult.text;
    } else if (extension === 'docx') {
      const mammoth = await import('mammoth');
      const mammothResult = await mammoth.extractRawText({ buffer });
      extractedText = mammothResult.value;
    } else if (['txt', 'text', 'md', 'csv'].includes(extension)) {
      extractedText = buffer.toString('utf-8');
    } else {
      // Attempt to read as plain text for unsupported formats
      extractedText = buffer.toString('utf-8');
    }

    if (!extractedText.trim()) {
      throw new Error('No text could be extracted from the document');
    }

    // Store extracted text on the document record
    await (supabase as any)
      .from('documents')
      .update({
        extracted_text: extractedText.slice(0, 100000), // Limit storage
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    // 3. Call AI review
    const aiService = new AIService(supabase as any);
    const reviewResult = await aiService.reviewDocument(orgId, userId, extractedText);

    const { score, findings, summary } = reviewResult.data;

    // 4. Save review results to documents table
    const hasCritical = findings.some((f) => f.severity === 'critical' || f.severity === 'error');
    const newStatus = hasCritical ? DocumentStatus.Flagged : DocumentStatus.Reviewed;

    await (supabase as any)
      .from('documents')
      .update({
        status: newStatus,
        review_score: score,
        review_findings: findings,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    // 5. Create a compliance check record
    const complianceService = new ComplianceService(supabase as any);
    const check = await complianceService.runCheck(orgId, userId, {
      check_type: ComplianceCheckType.DocumentReview,
      document_id: documentId,
    });

    await complianceService.updateCheckResult(check.id, {
      status: ComplianceCheckStatus.Completed,
      score,
      findings,
      summary,
      ai_used: reviewResult.aiUsed,
      model_used: reviewResult.model,
      tokens_used: reviewResult.tokensUsed,
    });

    // 6. Enqueue notification if issues found
    if (hasCritical) {
      // Look up the user's email to send the alert
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (profile?.email) {
        await enqueueNotification({
          type: 'compliance_alert',
          orgId,
          recipientEmail: profile.email,
          data: {
            checkId: check.id,
            checkType: ComplianceCheckType.DocumentReview,
            score,
            summary,
            findingsCount: findings.length,
          },
        });
      }
    }

    console.log(
      `[DocumentReviewWorker] Completed document ${documentId} - score: ${score}, findings: ${findings.length}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DocumentReviewWorker] Failed to process document ${documentId}:`, message);

    // Mark document as flagged with an error note
    await (supabase as any)
      .from('documents')
      .update({
        status: DocumentStatus.Flagged,
        review_findings: [
          {
            type: 'system_error',
            severity: 'error',
            message: `Automated review failed: ${message}`,
          },
        ],
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    throw error; // Re-throw so BullMQ marks the job as failed and retries
  }
}
