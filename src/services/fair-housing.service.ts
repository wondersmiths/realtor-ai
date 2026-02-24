import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { FairHousingResult, FairHousingViolation } from '@/types/domain';

/**
 * Prohibited terms dictionary organized by Fair Housing Act protected category.
 * Each entry maps a category to arrays of terms/phrases that may indicate
 * discriminatory language in real-estate listings and communications.
 */
const PROHIBITED_TERMS: Record<string, string[]> = {
  familial_status: [
    'no children',
    'no kids',
    'adults only',
    'adult community',
    'adult living',
    'perfect for couples',
    'empty nesters only',
    'empty nester',
    'no families',
    'singles only',
    'mature community',
    'not suitable for children',
    'child-free',
    'childfree',
    'no playgrounds',
    'quiet adult',
    'retired persons',
    'senior living',
    'over 55',
    'over 62',
    '55 and older',
    '62 and older',
    'retirees only',
  ],
  race_ethnicity: [
    'exclusive neighborhood',
    'exclusive community',
    'exclusive area',
    'integrated area',
    'integrated neighborhood',
    'predominantly white',
    'predominantly black',
    'ethnic neighborhood',
    'racially diverse',
    'white neighborhood',
    'black neighborhood',
    'hispanic area',
    'asian community',
    'restricted neighborhood',
    'private community',
    'traditional neighborhood',
    'country club community',
  ],
  religion: [
    'christian neighborhood',
    'christian community',
    'near church',
    'near mosque',
    'near synagogue',
    'near temple',
    'muslim neighborhood',
    'jewish community',
    'catholic area',
    'protestant neighborhood',
    'bible belt',
    'faith-based community',
    'religious community',
    'church community',
  ],
  disability: [
    'no wheelchairs',
    'no wheelchair',
    'must be able to climb stairs',
    'must climb stairs',
    'not wheelchair accessible',
    'no handicapped',
    'no disabled',
    'able-bodied only',
    'able bodied only',
    'physically fit',
    'no mental illness',
    'no service animals',
    'no emotional support animals',
    'walking distance only',
    'must be able to walk',
    'not suitable for disabled',
    'no special needs',
  ],
  national_origin: [
    'english speakers only',
    'english only',
    'must speak english',
    'american families',
    'american born',
    'native born',
    'citizens only',
    'no immigrants',
    'no foreigners',
    'born in america',
    'us citizens only',
    'legal residents only',
    'speak american',
    'fluent english required',
  ],
  gender_sex: [
    'bachelor pad',
    'man cave',
    'bachelorette',
    'ladies only',
    'men only',
    'women only',
    'female only',
    'male only',
    'gentlemen only',
    'sorority house',
    'fraternity house',
    'mothers only',
    'fathers only',
    'single women',
    'single men',
    'girls only',
    'boys only',
  ],
};

/**
 * Severity mappings for each category.
 * Some categories are considered more severe due to historical enforcement patterns.
 */
const CATEGORY_SEVERITY: Record<string, FairHousingViolation['severity']> = {
  familial_status: 'high',
  race_ethnicity: 'critical',
  religion: 'high',
  disability: 'critical',
  national_origin: 'critical',
  gender_sex: 'medium',
};

/**
 * Human-readable category labels.
 */
const CATEGORY_LABELS: Record<string, string> = {
  familial_status: 'Familial Status',
  race_ethnicity: 'Race / Ethnicity',
  religion: 'Religion',
  disability: 'Disability',
  national_origin: 'National Origin',
  gender_sex: 'Gender / Sex',
};

/**
 * Suggestions for each category.
 */
const CATEGORY_SUGGESTIONS: Record<string, string> = {
  familial_status:
    'Remove references to family composition. Describe the property features instead (e.g., number of bedrooms).',
  race_ethnicity:
    'Remove references to racial or ethnic composition of the neighborhood. Focus on property and location features.',
  religion:
    'Remove references to religious institutions or communities. Use neutral location descriptions.',
  disability:
    'Remove references to physical or mental ability requirements. Describe accessibility features neutrally.',
  national_origin:
    'Remove references to national origin, citizenship, or language requirements. These violate the Fair Housing Act.',
  gender_sex:
    'Remove gender-specific references. Use gender-neutral language to describe the property.',
};

export class FairHousingService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Validate text against the Fair Housing Act prohibited-terms dictionary.
   * This is a rule-based check only (no AI). Returns violations with context.
   */
  validateText(text: string): FairHousingResult {
    const violations: FairHousingViolation[] = [];
    const normalizedText = text.toLowerCase();

    for (const [category, terms] of Object.entries(PROHIBITED_TERMS)) {
      for (const term of terms) {
        const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(normalizedText)) !== null) {
          // Extract surrounding context (up to 40 chars before and after)
          const startCtx = Math.max(0, match.index - 40);
          const endCtx = Math.min(text.length, match.index + match[0].length + 40);
          const _context = text.slice(startCtx, endCtx).trim();
          const _prefix = startCtx > 0 ? '...' : '';
          const _suffix = endCtx < text.length ? '...' : '';
          violations.push({
            text: match[0],
            category: CATEGORY_LABELS[category] || category,
            severity: CATEGORY_SEVERITY[category] || 'medium',
            explanation: `The phrase "${match[0]}" may violate Fair Housing Act protections for ${CATEGORY_LABELS[category] || category}.`,
            suggestion: CATEGORY_SUGGESTIONS[category] || 'Consider using neutral, property-focused language.',
          });
        }
      }
    }

    // Deduplicate violations based on matched text + category
    const seen = new Set<string>();
    const deduplicated = violations.filter((v) => {
      const key = `${v.text.toLowerCase()}|${v.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Calculate score: 100 = clean, deduct points per violation by severity
    const severityPenalties: Record<string, number> = {
      critical: 25,
      high: 15,
      medium: 10,
      low: 5,
    };

    let score = 100;
    for (const v of deduplicated) {
      score -= severityPenalties[v.severity] || 10;
    }
    score = Math.max(0, score);

    return {
      violations: deduplicated,
      score,
      aiUsed: false,
    };
  }

  /**
   * Escape special regex characters in a string for safe use in RegExp constructor.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
