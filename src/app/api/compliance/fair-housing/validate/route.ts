import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { FairHousingService } from '@/services/fair-housing.service';
import { AIService } from '@/services/ai.service';
import { AppError, ValidationError } from '@/lib/errors';

/**
 * POST /api/compliance/fair-housing/validate
 * Validate text for Fair Housing Act compliance.
 * Uses rule-based FairHousingService for immediate results, then optionally
 * enhances with AI-powered analysis from AIService.
 *
 * Body: { text: string, context?: 'listing_description' | 'advertisement' | 'communication' }
 */
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();

    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      throw new ValidationError('Text is required for fair housing validation', {
        text: ['A non-empty text string is required'],
      });
    }

    const fairHousingService = new FairHousingService(supabase);
    const aiService = new AIService(supabase);

    // Step 1: Rule-based validation (instant, always available)
    const ruleResult = fairHousingService.validateText(body.text);

    // Step 2: AI-enhanced check (may fall back gracefully)
    let aiResult = null;
    try {
      const aiResponse = await aiService.checkFairHousing(orgId, user.id, body.text);
      aiResult = aiResponse;
    } catch {
      // AI check failed - rule-based result is still valid
    }

    // Merge results: combine rule-based violations with AI-detected ones
    const mergedViolations = [...ruleResult.violations];

    if (aiResult && aiResult.aiUsed && aiResult.data.violations) {
      // Add AI-detected violations that are not already found by rules
      for (const aiViolation of aiResult.data.violations) {
        const alreadyFound = mergedViolations.some(
          (v) =>
            v.text.toLowerCase() === aiViolation.text.toLowerCase() &&
            v.category === aiViolation.category
        );
        if (!alreadyFound) {
          mergedViolations.push(aiViolation);
        }
      }
    }

    // Use the lower (more conservative) score
    const finalScore = aiResult?.aiUsed
      ? Math.min(ruleResult.score, aiResult.data.score)
      : ruleResult.score;

    return NextResponse.json({
      data: {
        violations: mergedViolations,
        score: finalScore,
        ruleBasedResult: {
          violations: ruleResult.violations,
          score: ruleResult.score,
        },
        aiResult: aiResult
          ? {
              violations: aiResult.data.violations,
              score: aiResult.data.score,
              aiUsed: aiResult.aiUsed,
              model: aiResult.model,
              fallback: aiResult.fallback,
            }
          : null,
        context: body.context || null,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
    console.error('[API] POST /api/compliance/fair-housing/validate error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR', statusCode: 500 } },
      { status: 500 }
    );
  }
}
