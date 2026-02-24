import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIService } from '@/services/ai.service';
import { ComplianceService } from '@/services/compliance.service';
import { DocumentStatus, ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';
import { enqueueNotification } from '@/lib/queue/producer';
import type { DocumentReviewJob } from '@/lib/queue/jobs';
import { deepParsePdf, detectSignatures, optimizePdf } from '@/lib/pdf';
import { MLS_FILE_SIZE_THRESHOLD } from '@/lib/constants';
import type { PdfDeepParseResult, SignatureDetectionResult, PdfOptimizationResult, PdfOptimizationMetadata } from '@/types/pdf';

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
  let pageCount: number | undefined;
  let deepParseResult: PdfDeepParseResult | null = null;
  let signatureDetection: SignatureDetectionResult | null = null;
  let optimizationResult: PdfOptimizationResult | null = null;

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
      pageCount = pdfResult.numpages;

      // Deep-parse PDF structure (non-fatal — log warning on failure)
      try {
        deepParseResult = await deepParsePdf(buffer);
      } catch (deepParseErr) {
        console.warn(
          `[DocumentReviewWorker] Deep PDF parse failed for ${documentId}:`,
          deepParseErr instanceof Error ? deepParseErr.message : deepParseErr,
        );
      }

      // Multi-path signature detection (non-fatal)
      try {
        signatureDetection = await detectSignatures(buffer, extractedText, deepParseResult ?? undefined);
      } catch (sigDetectErr) {
        console.warn(
          `[DocumentReviewWorker] Signature detection failed for ${documentId}:`,
          sigDetectErr instanceof Error ? sigDetectErr.message : sigDetectErr,
        );
      }

      // PDF optimization — analyze, compress, split if needed (non-fatal)
      try {
        optimizationResult = await optimizePdf(buffer, {
          thresholdBytes: MLS_FILE_SIZE_THRESHOLD,
        });
      } catch (optimizeErr) {
        console.warn(
          `[DocumentReviewWorker] PDF optimization failed for ${documentId}:`,
          optimizeErr instanceof Error ? optimizeErr.message : optimizeErr,
        );
      }
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

    // Fetch current metadata and merge page count + text length
    const { data: currentDoc } = await (supabase as any)
      .from('documents')
      .select('metadata')
      .eq('id', documentId)
      .single();

    // Build serializable optimization metadata (strip Buffers) and upload split parts
    let optimizationMeta: PdfOptimizationMetadata | null = null;
    if (optimizationResult) {
      const splitPartPaths: string[] = [];

      // Upload split parts to Supabase Storage if splitting occurred
      if (optimizationResult.split && optimizationResult.split.parts.length > 1) {
        for (let i = 0; i < optimizationResult.split.parts.length; i++) {
          const part = optimizationResult.split.parts[i];
          const partPath = `${orgId}/${documentId}/split/part-${i + 1}.pdf`;
          try {
            await (supabase as any).storage
              .from('documents')
              .upload(partPath, part.buffer, {
                contentType: 'application/pdf',
                upsert: true,
              });
            splitPartPaths.push(partPath);
          } catch (uploadErr) {
            console.warn(
              `[DocumentReviewWorker] Failed to upload split part ${i + 1} for ${documentId}:`,
              uploadErr instanceof Error ? uploadErr.message : uploadErr,
            );
          }
        }
      }

      optimizationMeta = {
        analysis: optimizationResult.analysis,
        compression: optimizationResult.compression
          ? {
              originalSizeBytes: optimizationResult.compression.originalSizeBytes,
              compressedSizeBytes: optimizationResult.compression.compressedSizeBytes,
              compressionRatio: optimizationResult.compression.compressionRatio,
              usedObjectStreams: optimizationResult.compression.usedObjectStreams,
              strippedMetadata: optimizationResult.compression.strippedMetadata,
              meetsThreshold: optimizationResult.compression.meetsThreshold,
            }
          : null,
        split: optimizationResult.split
          ? {
              totalParts: optimizationResult.split.totalParts,
              originalPageCount: optimizationResult.split.originalPageCount,
              originalSizeBytes: optimizationResult.split.originalSizeBytes,
              allPartsUnderThreshold: optimizationResult.split.allPartsUnderThreshold,
              splitMode: optimizationResult.split.splitMode,
              parts: optimizationResult.split.parts.map((p) => ({
                startPage: p.startPage,
                endPage: p.endPage,
                pageCount: p.pageCount,
                sizeBytes: p.sizeBytes,
                label: p.label,
              })),
            }
          : null,
        finalSizeBytes: optimizationResult.finalSizeBytes,
        meetsThreshold: optimizationResult.meetsThreshold,
        actionTaken: optimizationResult.actionTaken,
        ...(splitPartPaths.length > 0 ? { splitPartPaths } : {}),
        version: optimizationResult.version,
        timestamp: optimizationResult.timestamp,
      };
    }

    const mergedMetadata = {
      ...(currentDoc?.metadata ?? {}),
      pageCount,
      extractedTextLength: extractedText.length,
      ...(deepParseResult ? { pdfStructure: deepParseResult } : {}),
      ...(signatureDetection ? { signatureDetection } : {}),
      ...(optimizationMeta ? { optimization: optimizationMeta } : {}),
    };

    // Store extracted text and updated metadata on the document record
    await (supabase as any)
      .from('documents')
      .update({
        extracted_text: extractedText.slice(0, 100000), // Limit storage
        metadata: mergedMetadata,
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
