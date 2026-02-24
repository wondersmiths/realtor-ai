import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIService } from '@/services/ai.service';
import { ComplianceService } from '@/services/compliance.service';
import { FairHousingService } from '@/services/fair-housing.service';
import { DisclosureService } from '@/services/disclosure.service';
import { ComplianceCheckType, ComplianceCheckStatus } from '@/types/enums';
import type { Listing } from '@/types/database';
import type { ComplianceCheckJob } from '@/lib/queue/jobs';

/**
 * Compliance check processor.
 *
 * Routes to the appropriate check handler based on `checkType`:
 * - fair_housing -> FairHousingService (rule-based) + AIService.checkFairHousing
 * - listing_compliance -> AIService.checkListingCompliance
 * - document_review -> triggers document-review worker logic
 * - disclosure_completeness -> DisclosureService.checkCompleteness
 */
export async function processComplianceCheck(job: Job<ComplianceCheckJob>): Promise<void> {
  const { checkId, orgId, userId, checkType, listingId, documentId } = job.data;
  const supabase = getSupabaseAdmin();
  const complianceService = new ComplianceService(supabase as any);
  const aiService = new AIService(supabase as any);

  console.log(`[ComplianceCheckWorker] Processing check ${checkId} (type: ${checkType})`);

  // Mark check as running
  await complianceService.markRunning(checkId);

  try {
    switch (checkType) {
      // ────────────────────────────
      // Fair Housing
      // ────────────────────────────
      case ComplianceCheckType.FairHousing: {
        // Load input text from the check record
        const check = await complianceService.getCheckById(orgId, checkId);
        const text = check.input_text || '';

        if (!text) {
          await complianceService.markFailed(checkId, 'No input text provided for fair housing check');
          return;
        }

        // Run rule-based check
        const fairHousingService = new FairHousingService(supabase as any);
        const ruleResult = fairHousingService.validateText(text);

        // Run AI-enhanced check
        const aiResult = await aiService.checkFairHousing(orgId, userId, text);

        // Merge findings (deduplicate by text + category)
        const seen = new Set<string>();
        const mergedViolations = [...ruleResult.violations];
        for (const v of ruleResult.violations) {
          seen.add(`${v.text.toLowerCase()}|${v.category.toLowerCase()}`);
        }
        for (const v of aiResult.data.violations) {
          const key = `${v.text.toLowerCase()}|${v.category.toLowerCase()}`;
          if (!seen.has(key)) {
            mergedViolations.push(v);
            seen.add(key);
          }
        }

        // Use the lower score (more conservative)
        const score = Math.min(ruleResult.score, aiResult.data.score);

        const findings = mergedViolations.map((v) => ({
          type: 'fair_housing',
          severity: v.severity as 'info' | 'warning' | 'error' | 'critical',
          message: v.explanation,
          location: v.text,
          suggestion: v.suggestion,
        }));

        await complianceService.updateCheckResult(checkId, {
          status: ComplianceCheckStatus.Completed,
          score,
          findings,
          summary: `Fair housing analysis found ${mergedViolations.length} potential violation(s). Score: ${score}/100.`,
          ai_used: aiResult.aiUsed,
          model_used: aiResult.model,
          tokens_used: aiResult.tokensUsed,
        });
        break;
      }

      // ────────────────────────────
      // Listing Compliance
      // ────────────────────────────
      case ComplianceCheckType.ListingCompliance: {
        if (!listingId) {
          await complianceService.markFailed(checkId, 'No listing ID provided');
          return;
        }

        const { data: listing, error: listingError } = await (supabase as any)
          .from('listings')
          .select('*')
          .eq('id', listingId)
          .eq('organization_id', orgId)
          .single();

        if (listingError || !listing) {
          await complianceService.markFailed(checkId, 'Listing not found');
          return;
        }

        const typedListing = listing as Listing;
        const aiResult = await aiService.checkListingCompliance(orgId, userId, typedListing);

        await complianceService.updateCheckResult(checkId, {
          status: ComplianceCheckStatus.Completed,
          score: aiResult.data.score,
          findings: aiResult.data.findings,
          summary: aiResult.data.summary,
          ai_used: aiResult.aiUsed,
          model_used: aiResult.model,
          tokens_used: aiResult.tokensUsed,
        });

        // Update listing compliance score
        await (supabase as any)
          .from('listings')
          .update({
            compliance_score: aiResult.data.score,
            last_compliance_check: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', listingId);

        break;
      }

      // ────────────────────────────
      // Document Review
      // ────────────────────────────
      case ComplianceCheckType.DocumentReview: {
        if (!documentId) {
          await complianceService.markFailed(checkId, 'No document ID provided');
          return;
        }

        // Fetch document and its extracted text
        const { data: doc } = await (supabase as any)
          .from('documents')
          .select('extracted_text, name')
          .eq('id', documentId)
          .eq('organization_id', orgId)
          .single();

        if (!doc?.extracted_text) {
          await complianceService.markFailed(checkId, 'Document has no extracted text. Upload and review the document first.');
          return;
        }

        const aiResult = await aiService.reviewDocument(orgId, userId, doc.extracted_text);

        await complianceService.updateCheckResult(checkId, {
          status: ComplianceCheckStatus.Completed,
          score: aiResult.data.score,
          findings: aiResult.data.findings,
          summary: aiResult.data.summary,
          ai_used: aiResult.aiUsed,
          model_used: aiResult.model,
          tokens_used: aiResult.tokensUsed,
        });
        break;
      }

      // ────────────────────────────
      // Disclosure Completeness
      // ────────────────────────────
      case ComplianceCheckType.DisclosureCompleteness: {
        if (!listingId) {
          await complianceService.markFailed(checkId, 'No listing ID provided for disclosure completeness check');
          return;
        }

        const disclosureService = new DisclosureService(supabase as any);
        const completeness = await disclosureService.checkCompleteness(orgId, listingId);

        const findings: Array<{ type: string; severity: 'info' | 'warning' | 'error' | 'critical'; message: string; suggestion: string }> = completeness.missing.map((type) => ({
          type: 'missing_disclosure',
          severity: 'error' as const,
          message: `Required disclosure "${type}" is missing or incomplete.`,
          suggestion: `Create and submit the "${type}" disclosure for this listing.`,
        }));

        // Add overdue disclosures as critical findings
        for (const d of completeness.overdue) {
          findings.push({
            type: 'overdue_disclosure',
            severity: 'critical' as const,
            message: `Disclosure "${d.title}" (${d.disclosure_type}) is overdue since ${d.due_date}.`,
            suggestion: 'Complete and submit this disclosure immediately to avoid compliance violations.',
          });
        }

        await complianceService.updateCheckResult(checkId, {
          status: ComplianceCheckStatus.Completed,
          score: completeness.completenessPercent,
          findings,
          summary: `Disclosure completeness: ${completeness.completenessPercent}%. ${completeness.missing.length} missing, ${completeness.overdue.length} overdue.`,
          ai_used: false,
        });
        break;
      }

      default:
        await complianceService.markFailed(checkId, `Unknown check type: ${checkType}`);
    }

    console.log(`[ComplianceCheckWorker] Completed check ${checkId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ComplianceCheckWorker] Failed check ${checkId}:`, message);
    await complianceService.markFailed(checkId, `Check failed: ${message}`);
    throw error;
  }
}
