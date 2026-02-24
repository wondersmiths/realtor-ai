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
} from '@/types/domain';
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
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const CACHE_TTL_HOURS = 24;

// Cost per 1K tokens in cents (approximate for Claude claude-sonnet-4-20250514)
const INPUT_COST_PER_1K_CENTS = 0.3;
const OUTPUT_COST_PER_1K_CENTS = 1.5;

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
    const { orgId, userId, operation, promptBuilder, responseSchema, fallbackFn } = options;
    const startTime = Date.now();

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
    } catch {
      // No quota record found - proceed (org may not have quotas configured)
    }

    // 4. Check cost limits
    try {
      const { data: costLimit } = await this.supabase
        .from('ai_cost_limits')
        .select('*')
        .eq('organization_id', orgId)
        .single();

      if (costLimit) {
        const typedCostLimit = costLimit as AICostLimit;

        if (typedCostLimit.is_hard_limited) {
          // Check monthly spend
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

          if (totalSpent >= typedCostLimit.monthly_hard_limit_cents) {
            return this.buildFallbackResult(fallbackFn(), 'Monthly AI cost limit reached');
          }

          // Check daily spend
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

          if (dailySpent >= typedCostLimit.daily_hard_limit_cents) {
            return this.buildFallbackResult(fallbackFn(), 'Daily AI cost limit reached');
          }
        }
      }
    } catch {
      // No cost limit record - proceed without limit enforcement
    }

    // 5. Check cache
    const prompts = promptBuilder();
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
          model: MODEL,
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

    const latencyMs = Date.now() - startTime;

    if (!response) {
      // All retries failed
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
    const costCents = Math.ceil(
      (inputTokens / 1000) * INPUT_COST_PER_1K_CENTS +
        (outputTokens / 1000) * OUTPUT_COST_PER_1K_CENTS
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
      await this.supabase
        .from('org_ai_quota')
        .update({
          used_ai_checks: quota.used_ai_checks + 1,
          used_tokens: quota.used_tokens + totalTokens,
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
          model: MODEL,
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
      model: MODEL,
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
        user: `Please review this document text for compliance:\n\n${text.slice(0, 15000)}`,
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
        user: `Analyze this text for Fair Housing Act compliance:\n\n${text.slice(0, 15000)}`,
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
    const listingText = [
      listing.description || '',
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

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

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
        model: MODEL,
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
