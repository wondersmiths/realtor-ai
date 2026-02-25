import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Listing,
  OrganizationAIQuota,
  AICostLimit,
  AICache,
  ComplianceCheckFindingJSON,
} from '@/types/database';
import { AIUsageStatus } from '@/types/enums';
import type {
  AIResult,
  FairHousingResult,
  FairHousingViolation,
  DocumentClassification,
  ComplianceExplanation,
  RiskPredictionResult,
} from '@/types/domain';
import {
  documentClassificationSchema,
  complianceExplanationSchema,
  riskPredictionResultSchema,
} from '@/lib/ai/schemas';
import { prepareInput } from '@/lib/ai/preprocessing';
import { aiLimiter, checkRateLimit } from '@/lib/redis/rate-limiter';
import { createHash } from 'crypto';

// ──────────────────────────────────────────────
// Types used within this service
// ──────────────────────────────────────────────

export interface DocumentReviewResult {
  score: number;
  findings: ComplianceCheckFindingJSON[];
  summary: string;
}

export interface ComplianceResult {
  score: number;
  findings: ComplianceCheckFindingJSON[];
  summary: string;
  fairHousingIssues: FairHousingViolation[];
}

interface ExecuteAICallOptions<T> {
  orgId: string;
  userId?: string;
  operation: string;
  promptBuilder: () => { system: string; user: string };
  responseSchema: z.ZodSchema<T>;
  fallbackFn: () => T;
  maxInputChars?: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const CACHE_TTL_HOURS = 24;
const DEFAULT_MAX_INPUT_CHARS = 15000;

// ──────────────────────────────────────────────
// Model routing
// ──────────────────────────────────────────────

type ModelTier = 'fast' | 'standard' | 'premium';

const MODEL_TIER_RANK: ModelTier[] = ['fast', 'standard', 'premium'];

const DEFAULT_MODEL_TIER_MAP: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-20250514',
  standard: 'claude-sonnet-4-20250514',
  premium: 'claude-opus-4-20250514',
};

function buildModelTierMap(): Record<ModelTier, string> {
  return {
    fast: process.env.AI_MODEL_FAST || DEFAULT_MODEL_TIER_MAP.fast,
    standard: process.env.AI_MODEL_STANDARD || DEFAULT_MODEL_TIER_MAP.standard,
    premium: process.env.AI_MODEL_PREMIUM || DEFAULT_MODEL_TIER_MAP.premium,
  };
}

const MODEL_TIER_MAP = buildModelTierMap();

const FALLBACK_MODEL_ID = process.env.AI_MODEL_FALLBACK || DEFAULT_MODEL_TIER_MAP.fast;

const OPERATION_MODEL_TIER: Record<string, ModelTier> = {
  document_classification: 'fast',
  compliance_explanation: 'standard',
  document_review: 'standard',
  fair_housing_check: 'standard',
  listing_compliance: 'standard',
  risk_prediction: 'premium',
};

// Credit cost per operation type
const OPERATION_CREDIT_COST: Record<string, number> = {
  document_review: 1,
  fair_housing_check: 1,
  listing_compliance: 1,
  document_classification: 1,
  compliance_explanation: 1,
  risk_prediction: 2,
  batch_process: 5,
};

function resolveModel(operation: string, downgradeSteps = 0): string {
  const baseTier = OPERATION_MODEL_TIER[operation] || 'standard';
  const baseIndex = MODEL_TIER_RANK.indexOf(baseTier);
  const downgradedIndex = Math.max(0, baseIndex - downgradeSteps);
  return MODEL_TIER_MAP[MODEL_TIER_RANK[downgradedIndex]];
}

// Cost per 1K tokens in cents, keyed by model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-20250514': { input: 1.5, output: 7.5 },
  'claude-sonnet-4-20250514': { input: 0.3, output: 1.5 },
  'claude-haiku-4-20250514': { input: 0.08, output: 0.4 },
};

// ──────────────────────────────────────────────
// Response schemas for Zod validation
// ──────────────────────────────────────────────

const documentReviewSchema = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      message: z.string(),
      location: z.string().optional(),
      suggestion: z.string().optional(),
      rule_id: z.string().optional(),
    })
  ),
  summary: z.string(),
});

const fairHousingResultSchema = z.object({
  violations: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      explanation: z.string(),
      suggestion: z.string(),
    })
  ),
  score: z.number().min(0).max(100),
  aiUsed: z.literal(true),
});

const complianceResultSchema = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      message: z.string(),
      location: z.string().optional(),
      suggestion: z.string().optional(),
      rule_id: z.string().optional(),
    })
  ),
  summary: z.string(),
  fairHousingIssues: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      explanation: z.string(),
      suggestion: z.string(),
    })
  ),
});

export class AIService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Core method that orchestrates all AI calls with full governance:
   *  1. Check AI_ENABLED env var
   *  2. Check org.ai_enabled
   *  3. Check quota via org_ai_quota
   *  4. Check cost limits via ai_cost_limits
   *  5. Check ai_cache for cached response
   *  6. If unavailable -> return fallback
   *  7. Call Anthropic with retry (3x exponential backoff)
   *  8. Validate response against schema
   *  9. Track usage in ai_usage table
   * 10. Update quota counters
   * 11. Cache result in ai_cache
   * 12. On error -> log + return fallback
   */
  async executeAICall<T>(options: ExecuteAICallOptions<T>): Promise<AIResult<T>> {
    const { orgId, userId, operation, promptBuilder, responseSchema, fallbackFn, maxInputChars } = options;
    const startTime = Date.now();
    let downgradeSteps = 0;
    let model = resolveModel(operation, 0);

    // 1. Check global AI_ENABLED env var
    const aiEnabled = process.env.AI_ENABLED !== 'false';
    if (!aiEnabled) {
      return this.buildFallbackResult(fallbackFn(), 'AI is globally disabled');
    }

    // 2. Check org.ai_enabled
    try {
      const { data: org } = await this.supabase
        .from('organizations')
        .select('ai_enabled')
        .eq('id', orgId)
        .single();

      if (!org?.ai_enabled) {
        return this.buildFallbackResult(fallbackFn(), 'AI is disabled for this organization');
      }
    } catch {
      return this.buildFallbackResult(fallbackFn(), 'Failed to verify org AI settings');
    }

    // 2b. Check rate limit
    const { success: withinLimit } = await checkRateLimit(aiLimiter, orgId);
    if (!withinLimit) {
      return this.buildFallbackResult(fallbackFn(), 'AI rate limit exceeded');
    }

    // 3. Check quota
    let quota: OrganizationAIQuota | null = null;
    try {
      const { data } = await this.supabase
        .from('org_ai_quota')
        .select('*')
        .eq('organization_id', orgId)
        .gte('period_end', new Date().toISOString())
        .order('period_end', { ascending: false })
        .limit(1)
        .single();

      quota = data as OrganizationAIQuota | null;

      if (quota && quota.used_ai_checks >= quota.max_ai_checks) {
        return this.buildFallbackResult(fallbackFn(), 'AI check quota exceeded');
      }

      // 3b. Check credit quota
      if (quota) {
        const creditCost = OPERATION_CREDIT_COST[operation] ?? 1;
        if (quota.used_credits + creditCost > quota.max_credits) {
          return this.buildFallbackResult(fallbackFn(), 'AI credit quota exceeded');
        }
      }
    } catch {
      // No quota record found - proceed (org may not have quotas configured)
    }

    // 4. Check cost limits & compute cost-aware downgrade
    try {
      const { data: costLimit } = await this.supabase
        .from('ai_cost_limits')
        .select('*')
        .eq('organization_id', orgId)
        .single();

      if (costLimit) {
        const typedCostLimit = costLimit as AICostLimit;

        // Fetch monthly spend
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { data: monthlyUsage } = await this.supabase
          .from('ai_usage')
          .select('cost_cents')
          .eq('organization_id', orgId)
          .gte('created_at', monthStart.toISOString());

        const totalSpent = (monthlyUsage || []).reduce(
          (sum: number, row: any) => sum + (row.cost_cents || 0),
          0
        );

        // Fetch daily spend
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);

        const { data: dailyUsage } = await this.supabase
          .from('ai_usage')
          .select('cost_cents')
          .eq('organization_id', orgId)
          .gte('created_at', dayStart.toISOString());

        const dailySpent = (dailyUsage || []).reduce(
          (sum: number, row: any) => sum + (row.cost_cents || 0),
          0
        );

        // Cost-aware downgrade based on monthly soft limit
        if (typedCostLimit.monthly_soft_limit_cents > 0) {
          const spendPct = (totalSpent / typedCostLimit.monthly_soft_limit_cents) * 100;
          if (spendPct >= 100) {
            downgradeSteps = 2;
          } else if (spendPct >= typedCostLimit.alert_threshold_pct) {
            downgradeSteps = 1;
          }
        }

        // Cost-aware downgrade based on daily hard limit
        if (typedCostLimit.daily_hard_limit_cents > 0) {
          const dailyPct = (dailySpent / typedCostLimit.daily_hard_limit_cents) * 100;
          if (dailyPct >= 95) {
            downgradeSteps = Math.max(downgradeSteps, 2);
          } else if (dailyPct >= 80) {
            downgradeSteps = Math.max(downgradeSteps, 1);
          }
        }

        // Re-resolve model if downgraded
        if (downgradeSteps > 0) {
          const previousModel = model;
          model = resolveModel(operation, downgradeSteps);
          if (model !== previousModel) {
            console.log(
              `[AIService] Cost-aware downgrade: ${operation} ${previousModel} → ${model} (downgradeSteps=${downgradeSteps})`
            );
          }
        }

        // Hard-limit bail-outs
        if (typedCostLimit.is_hard_limited) {
          if (totalSpent >= typedCostLimit.monthly_hard_limit_cents) {
            return this.buildFallbackResult(fallbackFn(), 'Monthly AI cost limit reached');
          }

          if (dailySpent >= typedCostLimit.daily_hard_limit_cents) {
            return this.buildFallbackResult(fallbackFn(), 'Daily AI cost limit reached');
          }
        }
      }
    } catch {
      // No cost limit record - proceed without limit enforcement
    }

    // 5. Check cache
    const rawPrompts = promptBuilder();
    const maxChars = maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    const prompts = {
      system: rawPrompts.system,
      user: this.preprocessInput(rawPrompts.user, maxChars),
    };
    const inputHash = this.hashInput(operation, prompts.system, prompts.user);

    try {
      const { data: cached } = await this.supabase
        .from('ai_cache')
        .select('*')
        .eq('organization_id', orgId)
        .eq('cache_key', `${operation}:${inputHash}`)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cached) {
        const typedCache = cached as AICache;

        // Increment hit count
        await this.supabase
          .from('ai_cache')
          .update({ hit_count: typedCache.hit_count + 1 })
          .eq('id', typedCache.id);

        try {
          const parsed = responseSchema.parse(typedCache.response);
          return {
            data: parsed,
            aiUsed: true,
            fallback: false,
            model: typedCache.model,
            tokensUsed: typedCache.tokens_saved,
            latencyMs: Date.now() - startTime,
            cached: true,
          };
        } catch {
          // Cache content invalid against current schema - proceed with fresh call
        }
      }
    } catch {
      // Cache miss - proceed with API call
    }

    // 6. Check for Anthropic API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return this.buildFallbackResult(fallbackFn(), 'Anthropic API key not configured');
    }

    // 7. Call Anthropic with retry (3x exponential backoff)
    const client = new Anthropic({ apiKey });
    let lastError: Error | null = null;
    let response: Anthropic.Message | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: prompts.system,
          messages: [
            {
              role: 'user',
              content: prompts.user,
            },
          ],
        });
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRIES - 1) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    // 7b. Fallback model attempt if primary model failed
    if (!response && model !== FALLBACK_MODEL_ID) {
      console.log(
        `[AIService] Primary model failed for ${operation}, attempting fallback: ${FALLBACK_MODEL_ID}`
      );
      try {
        response = await client.messages.create({
          model: FALLBACK_MODEL_ID,
          max_tokens: 4096,
          system: prompts.system,
          messages: [
            {
              role: 'user',
              content: prompts.user,
            },
          ],
        });
        model = FALLBACK_MODEL_ID;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!response) {
      // All retries and fallback failed
      await this.trackUsage(orgId, userId || null, operation, {
        status: AIUsageStatus.Error,
        errorMessage: lastError?.message || 'All retries failed',
        latencyMs,
      });

      return this.buildFallbackResult(
        fallbackFn(),
        lastError?.message || 'AI call failed after retries'
      );
    }

    // Extract text from response
    const textBlock = response.content.find((c) => c.type === 'text');
    const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;
    const costs = MODEL_COSTS[model] || MODEL_COSTS['claude-sonnet-4-20250514'];
    const costCents = Math.ceil(
      (inputTokens / 1000) * costs.input +
        (outputTokens / 1000) * costs.output
    );

    // 8. Validate response against schema
    let parsed: T;
    try {
      // Try to extract JSON from the response text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }
      const rawJson = JSON.parse(jsonMatch[0]);
      parsed = responseSchema.parse(rawJson);
    } catch (parseErr) {
      // Schema validation failed - track as error and use fallback
      await this.trackUsage(orgId, userId || null, operation, {
        status: AIUsageStatus.Error,
        errorMessage: `Schema validation failed: ${parseErr instanceof Error ? parseErr.message : 'Unknown'}`,
        inputTokens,
        outputTokens,
        totalTokens,
        costCents,
        latencyMs,
      });

      return this.buildFallbackResult(fallbackFn(), 'AI response validation failed');
    }

    // 9. Track usage in ai_usage table
    await this.trackUsage(orgId, userId || null, operation, {
      status: AIUsageStatus.Success,
      inputTokens,
      outputTokens,
      totalTokens,
      costCents,
      latencyMs,
    });

    // 10. Update quota counters
    if (quota) {
      const creditCost = OPERATION_CREDIT_COST[operation] ?? 1;
      await this.supabase
        .from('org_ai_quota')
        .update({
          used_ai_checks: quota.used_ai_checks + 1,
          used_tokens: quota.used_tokens + totalTokens,
          used_credits: quota.used_credits + creditCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quota.id);
    }

    // 11. Cache result
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

      await this.supabase.from('ai_cache').upsert(
        {
          organization_id: orgId,
          cache_key: `${operation}:${inputHash}`,
          operation,
          input_hash: inputHash,
          response: parsed as Record<string, unknown>,
          model,
          tokens_saved: totalTokens,
          hit_count: 0,
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'organization_id,cache_key' }
      );
    } catch {
      // Caching failure is non-critical
      console.warn('[AIService] Failed to cache AI result');
    }

    return {
      data: parsed,
      aiUsed: true,
      fallback: false,
      model,
      tokensUsed: totalTokens,
      latencyMs,
      cached: false,
    };
  }

  /**
   * Review a document's text for compliance issues using AI.
   */
  async reviewDocument(
    orgId: string,
    userId: string,
    text: string
  ): Promise<AIResult<DocumentReviewResult>> {
    const prepared = prepareInput(text, { maxTokens: 3750, operation: 'document_review' });
    console.log(`[AIService] document_review: ${prepared.originalTokens}→${prepared.finalTokens} tokens (${prepared.reductionPct}% reduction)`);

    return this.executeAICall<DocumentReviewResult>({
      orgId,
      userId,
      operation: 'document_review',
      promptBuilder: () => ({
        system: `You are a real estate compliance expert. Review the following document text for legal and regulatory compliance issues.
Focus on:
- Missing required clauses or disclosures
- Potentially discriminatory language (Fair Housing Act)
- Unclear or ambiguous legal terms
- Missing signatures or dates references
- State-specific compliance requirements

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "score": <0-100 compliance score>,
  "findings": [
    {
      "type": "<finding type, e.g. missing_clause, fair_housing, ambiguous_language>",
      "severity": "<info|warning|error|critical>",
      "message": "<description of the issue>",
      "location": "<where in the text this was found>",
      "suggestion": "<how to fix it>"
    }
  ],
  "summary": "<brief overall summary>"
}`,
        user: `Please review this document text for compliance:\n\n${prepared.text}`,
      }),
      responseSchema: documentReviewSchema,
      fallbackFn: () => ({
        score: 50,
        findings: [
          {
            type: 'system',
            severity: 'info' as const,
            message:
              'AI review is currently unavailable. A manual review is recommended.',
          },
        ],
        summary:
          'Automated review could not be completed. Please review this document manually.',
      }),
    });
  }

  /**
   * Check text for Fair Housing Act violations using AI.
   */
  async checkFairHousing(
    orgId: string,
    userId: string,
    text: string
  ): Promise<AIResult<FairHousingResult>> {
    const prepared = prepareInput(text, { maxTokens: 3750, operation: 'fair_housing_check' });
    console.log(`[AIService] fair_housing_check: ${prepared.originalTokens}→${prepared.finalTokens} tokens (${prepared.reductionPct}% reduction)`);

    return this.executeAICall<FairHousingResult>({
      orgId,
      userId,
      operation: 'fair_housing_check',
      promptBuilder: () => ({
        system: `You are an expert in Fair Housing Act compliance for real estate. Analyze the provided text for any language that could violate the Fair Housing Act.

Protected classes under the Fair Housing Act:
- Race
- Color
- Religion
- National origin
- Sex (including gender identity and sexual orientation)
- Familial status
- Disability

Look for both explicit violations and subtle/implicit discriminatory language that could have a disparate impact.

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "violations": [
    {
      "text": "<the problematic text>",
      "category": "<protected class category>",
      "severity": "<low|medium|high|critical>",
      "explanation": "<why this is a potential violation>",
      "suggestion": "<suggested alternative language>"
    }
  ],
  "score": <0-100 where 100 is fully compliant>,
  "aiUsed": true
}`,
        user: `Analyze this text for Fair Housing Act compliance:\n\n${prepared.text}`,
      }),
      responseSchema: fairHousingResultSchema,
      fallbackFn: () => ({
        violations: [],
        score: 100,
        aiUsed: false,
      }),
    });
  }

  /**
   * Run a comprehensive compliance check on a listing using AI.
   */
  async checkListingCompliance(
    orgId: string,
    userId: string,
    listing: Listing
  ): Promise<AIResult<ComplianceResult>> {
    const preparedDesc = prepareInput(listing.description || '', { maxTokens: 3750, operation: 'listing_compliance' });
    console.log(`[AIService] listing_compliance: ${preparedDesc.originalTokens}→${preparedDesc.finalTokens} tokens (${preparedDesc.reductionPct}% reduction)`);

    const listingText = [
      preparedDesc.text,
      `Address: ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip_code}`,
      listing.property_type ? `Property Type: ${listing.property_type}` : '',
      listing.price ? `Price: $${listing.price.toLocaleString()}` : '',
      listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : '',
      listing.bathrooms ? `Bathrooms: ${listing.bathrooms}` : '',
      listing.square_feet ? `Square Feet: ${listing.square_feet.toLocaleString()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.executeAICall<ComplianceResult>({
      orgId,
      userId,
      operation: 'listing_compliance',
      promptBuilder: () => ({
        system: `You are a real estate compliance expert specializing in listing compliance. Review the provided listing for:

1. Fair Housing Act violations (discriminatory language)
2. Missing required information per state regulations
3. Accuracy and completeness issues
4. Marketing compliance (truth in advertising)
5. State-specific listing requirements for ${listing.state}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "score": <0-100 compliance score>,
  "findings": [
    {
      "type": "<finding type>",
      "severity": "<info|warning|error|critical>",
      "message": "<description>",
      "location": "<where found>",
      "suggestion": "<how to fix>"
    }
  ],
  "summary": "<brief overall summary>",
  "fairHousingIssues": [
    {
      "text": "<problematic text>",
      "category": "<protected class>",
      "severity": "<low|medium|high|critical>",
      "explanation": "<why this is an issue>",
      "suggestion": "<alternative language>"
    }
  ]
}`,
        user: `Please review this listing for compliance:\n\n${listingText}`,
      }),
      responseSchema: complianceResultSchema,
      fallbackFn: () => ({
        score: 50,
        findings: [
          {
            type: 'system',
            severity: 'info' as const,
            message:
              'AI compliance check is currently unavailable. A manual review is recommended.',
          },
        ],
        summary:
          'Automated compliance check could not be completed. Please review this listing manually.',
        fairHousingIssues: [],
      }),
    });
  }

  /**
   * Classify a document by type and jurisdiction using AI.
   */
  async classifyDocument(
    orgId: string,
    userId: string,
    text: string,
    fileName?: string
  ): Promise<AIResult<DocumentClassification>> {
    const prepared = prepareInput(text, { maxTokens: 2000, operation: 'document_classification' });
    console.log(`[AIService] document_classification: ${prepared.originalTokens}→${prepared.finalTokens} tokens (${prepared.reductionPct}% reduction)`);

    return this.executeAICall<DocumentClassification>({
      orgId,
      userId,
      operation: 'document_classification',
      maxInputChars: 8000,
      promptBuilder: () => ({
        system: `You are a real estate document classification expert. Classify the provided document by type, sub-type, and jurisdiction.

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "documentType": "<e.g. purchase_agreement, lease, disclosure, deed, addendum, inspection_report>",
  "confidence": <0-100 confidence score>,
  "subType": "<more specific type, e.g. seller_disclosure, lead_paint_disclosure>",
  "jurisdiction": "<state or jurisdiction if identifiable, otherwise 'unknown'>",
  "requiredActions": ["<action needed based on document type>"],
  "summary": "<brief summary of the document>"
}`,
        user: `Classify this document${fileName ? ` (filename: ${fileName})` : ''}:\n\n${prepared.text}`,
      }),
      responseSchema: documentClassificationSchema,
      fallbackFn: () => ({
        documentType: 'unknown',
        confidence: 0,
        subType: 'unknown',
        jurisdiction: 'unknown',
        requiredActions: [],
        summary: 'Document classification is currently unavailable.',
      }),
    });
  }

  /**
   * Generate a plain-language explanation of a compliance rule and finding.
   */
  async generateComplianceExplanation(
    orgId: string,
    userId: string,
    ruleId: string,
    findingMessage: string,
    jurisdiction?: string
  ): Promise<AIResult<ComplianceExplanation>> {
    const prepared = prepareInput(findingMessage, { maxTokens: 4000, operation: 'compliance_explanation' });
    console.log(`[AIService] compliance_explanation: ${prepared.originalTokens}→${prepared.finalTokens} tokens (${prepared.reductionPct}% reduction)`);

    return this.executeAICall<ComplianceExplanation>({
      orgId,
      userId,
      operation: 'compliance_explanation',
      maxInputChars: 4000,
      promptBuilder: () => ({
        system: `You are a real estate compliance expert. Provide a clear, plain-language explanation of the given compliance rule and finding. Include legal basis, impact assessment, and actionable remediation steps.

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "ruleId": "<the rule ID>",
  "ruleName": "<human-readable rule name>",
  "explanation": "<clear explanation of what this rule requires and why the finding was triggered>",
  "legalBasis": "<relevant law, regulation, or standard>",
  "impact": "<informational|moderate|severe>",
  "remediation": "<specific steps to resolve this finding>",
  "examples": ["<example of compliant vs non-compliant behavior>"]
}`,
        user: `Explain this compliance finding${jurisdiction ? ` (jurisdiction: ${jurisdiction})` : ''}:\n\nRule ID: ${ruleId}\nFinding: ${prepared.text}`,
      }),
      responseSchema: complianceExplanationSchema,
      fallbackFn: () => ({
        ruleId,
        ruleName: ruleId,
        explanation: 'Compliance explanation is currently unavailable. Please consult your compliance officer for details on this finding.',
        legalBasis: 'Unable to determine',
        impact: 'informational' as const,
        remediation: 'Please review this finding manually with your compliance team.',
        examples: [],
      }),
    });
  }

  /**
   * Predict risk patterns from portfolio-level compliance data.
   */
  async predictRiskPatterns(
    orgId: string,
    userId: string,
    portfolioData: {
      recentFindings: Array<{ type: string; severity: string; message: string }>;
      complianceScores: Array<{ area: string; score: number }>;
      violationHistory: Array<{ type: string; date: string; resolved: boolean }>;
    }
  ): Promise<AIResult<RiskPredictionResult>> {
    const portfolioText = `Recent Findings:\n${JSON.stringify(portfolioData.recentFindings, null, 2)}\n\nCompliance Scores:\n${JSON.stringify(portfolioData.complianceScores, null, 2)}\n\nViolation History:\n${JSON.stringify(portfolioData.violationHistory, null, 2)}`;
    const prepared = prepareInput(portfolioText, { maxTokens: 3000, operation: 'risk_prediction' });
    console.log(`[AIService] risk_prediction: ${prepared.originalTokens}→${prepared.finalTokens} tokens (${prepared.reductionPct}% reduction)`);

    return this.executeAICall<RiskPredictionResult>({
      orgId,
      userId,
      operation: 'risk_prediction',
      maxInputChars: 12000,
      promptBuilder: () => ({
        system: `You are a real estate compliance risk analyst. Analyze the provided portfolio data to identify risk patterns and predict potential compliance issues.

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "overallRiskScore": <0-100 where 100 is highest risk>,
  "patterns": [
    {
      "patternId": "<unique pattern identifier>",
      "patternName": "<descriptive name>",
      "riskLevel": "<low|medium|high|critical>",
      "probability": <0-100 likelihood of occurrence>,
      "description": "<description of the risk pattern>",
      "affectedAreas": ["<compliance areas affected>"],
      "preventiveActions": ["<recommended preventive action>"]
    }
  ],
  "summary": "<overall risk assessment summary>",
  "timeHorizon": "<e.g. 30 days, 90 days, 6 months>"
}`,
        user: `Analyze this portfolio data for risk patterns:\n\n${prepared.text}`,
      }),
      responseSchema: riskPredictionResultSchema,
      fallbackFn: () => ({
        overallRiskScore: 50,
        patterns: [],
        summary: 'Risk prediction is currently unavailable. Manual portfolio review is recommended.',
        timeHorizon: '90 days',
      }),
    });
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * Preprocess input text: sanitize, redact PII, and smart-truncate.
   */
  private preprocessInput(text: string, maxChars: number): string {
    // 1. Strip null bytes and control chars (keep \n, \r, \t)
    let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2. Collapse excessive whitespace (3+ newlines → 2, 2+ spaces → 1)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

    // 3. Redact PII patterns
    // SSN: xxx-xx-xxxx or xxxxxxxxx
    cleaned = cleaned.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
    cleaned = cleaned.replace(/\b\d{9}\b/g, '[SSN_REDACTED]');
    // Credit card: 13-19 digit sequences with optional separators
    cleaned = cleaned.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,7}\b/g, '[CC_REDACTED]');

    // 4. Smart truncation at sentence boundaries
    if (cleaned.length > maxChars) {
      const truncated = cleaned.slice(0, maxChars);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('.\n'),
        truncated.lastIndexOf('? '),
        truncated.lastIndexOf('! ')
      );
      if (lastSentenceEnd > maxChars * 0.8) {
        cleaned = truncated.slice(0, lastSentenceEnd + 1);
      } else {
        cleaned = truncated;
      }
    }

    return cleaned;
  }

  /**
   * Build a fallback result with metadata.
   */
  private buildFallbackResult<T>(data: T, reason: string): AIResult<T> {
    return {
      data,
      aiUsed: false,
      fallback: true,
      error: reason,
    };
  }

  /**
   * Create a deterministic hash of the input for caching.
   */
  private hashInput(operation: string, system: string, user: string): string {
    const content = `${operation}:${system}:${user}`;
    return createHash('sha256').update(content).digest('hex').slice(0, 32);
  }

  /**
   * Track an AI usage record in the ai_usage table.
   */
  private async trackUsage(
    orgId: string,
    userId: string | null,
    operation: string,
    details: {
      status: AIUsageStatus;
      model?: string;
      errorMessage?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      costCents?: number;
      latencyMs?: number;
    }
  ): Promise<void> {
    try {
      await this.supabase.from('ai_usage').insert({
        organization_id: orgId,
        user_id: userId,
        operation,
        model: details.model || resolveModel(operation),
        provider: 'anthropic',
        input_tokens: details.inputTokens || 0,
        output_tokens: details.outputTokens || 0,
        total_tokens: details.totalTokens || 0,
        cost_cents: details.costCents || 0,
        latency_ms: details.latencyMs || null,
        status: details.status,
        error_message: details.errorMessage || null,
        request_metadata: {},
      });
    } catch (err) {
      console.error('[AIService] Failed to track AI usage:', err);
    }
  }
}
