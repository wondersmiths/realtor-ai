import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIService } from '@/services/ai.service';
import { FairHousingService } from '@/services/fair-housing.service';
import { ComplianceService } from '@/services/compliance.service';
import { ComplianceCheckStatus } from '@/types/enums';
import type { FairHousingJob } from '@/lib/queue/jobs';
import type { FairHousingViolation } from '@/types/domain';

/**
 * Fair housing analysis processor.
 *
 * Pipeline:
 * 1. Run FairHousingService.validateText (rule-based dictionary check)
 * 2. Run AIService.checkFairHousing (AI-enhanced contextual analysis)
 * 3. Merge and deduplicate findings from both sources
 * 4. Save combined results to the compliance_check record
 * 5. Flag if violations are found (severity >= high)
 */
export async function processFairHousingCheck(job: Job<FairHousingJob>): Promise<void> {
  const { checkId, orgId, userId, text } = job.data;
  const supabase = getSupabaseAdmin();
  const complianceService = new ComplianceService(supabase as any);

  console.log(`[FairHousingWorker] Processing check ${checkId}`);

  // Mark as running
  await complianceService.markRunning(checkId);

  try {
    if (!text.trim()) {
      await complianceService.markFailed(checkId, 'No text provided for fair housing analysis');
      return;
    }

    // 1. Rule-based check
    const fairHousingService = new FairHousingService(supabase as any);
    const ruleResult = fairHousingService.validateText(text);

    // 2. AI-enhanced check
    const aiService = new AIService(supabase as any);
    const aiResult = await aiService.checkFairHousing(orgId, userId, text);

    // 3. Merge findings (deduplicate by lowercase text + category)
    const seen = new Set<string>();
    const mergedViolations: FairHousingViolation[] = [];

    // Add rule-based findings first (they are deterministic)
    for (const v of ruleResult.violations) {
      const key = `${v.text.toLowerCase()}|${v.category.toLowerCase()}`;
      if (!seen.has(key)) {
        mergedViolations.push(v);
        seen.add(key);
      }
    }

    // Add AI findings that were not already caught by rules
    for (const v of aiResult.data.violations) {
      const key = `${v.text.toLowerCase()}|${v.category.toLowerCase()}`;
      if (!seen.has(key)) {
        mergedViolations.push(v);
        seen.add(key);
      }
    }

    // Use the lower (more conservative) score
    const score = Math.min(ruleResult.score, aiResult.data.score);

    // Convert violations to compliance findings format
    const findings = mergedViolations.map((v) => ({
      type: 'fair_housing',
      severity: v.severity as 'info' | 'warning' | 'error' | 'critical',
      message: v.explanation,
      location: v.text,
      suggestion: v.suggestion,
      rule_id: `fh_${v.category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    }));

    // 4. Save results
    const hasHighSeverity = mergedViolations.some(
      (v) => v.severity === 'high' || v.severity === 'critical'
    );

    const summary = hasHighSeverity
      ? `ATTENTION: Fair housing analysis found ${mergedViolations.length} violation(s), including high/critical severity issues. Immediate review recommended. Score: ${score}/100.`
      : mergedViolations.length > 0
        ? `Fair housing analysis found ${mergedViolations.length} potential issue(s). Score: ${score}/100.`
        : `Fair housing analysis passed. No violations detected. Score: ${score}/100.`;

    await complianceService.updateCheckResult(checkId, {
      status: ComplianceCheckStatus.Completed,
      score,
      findings,
      summary,
      ai_used: aiResult.aiUsed,
      model_used: aiResult.model,
      tokens_used: aiResult.tokensUsed,
    });

    // 5. Log if violations flagged
    if (hasHighSeverity) {
      console.warn(
        `[FairHousingWorker] Check ${checkId} flagged with ${mergedViolations.length} violations (score: ${score})`
      );
    }

    console.log(
      `[FairHousingWorker] Completed check ${checkId} - score: ${score}, violations: ${mergedViolations.length}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FairHousingWorker] Failed check ${checkId}:`, message);
    await complianceService.markFailed(checkId, `Fair housing check failed: ${message}`);
    throw error;
  }
}
