/**
 * AI Input Preprocessing Pipeline
 *
 * Runs before AI calls to strip boilerplate, extract substantive content,
 * and enforce token-based limits — reducing cost and improving signal quality.
 */

export interface PreparedInput {
  text: string;
  originalTokens: number;
  finalTokens: number;
  reductionPct: number;
}

/**
 * Rough token estimate for English text (~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Strip common real estate document boilerplate via regex patterns.
 */
export function removeBoilerplate(text: string): string {
  let cleaned = text;

  // Page numbers: "Page 1 of 5", "Page 3", "- 2 -", standalone page digits
  cleaned = cleaned.replace(/\bPage\s+\d+\s*(of\s+\d+)?\b/gi, '');
  cleaned = cleaned.replace(/^-\s*\d+\s*-$/gm, '');

  // Copyright notices
  cleaned = cleaned.replace(/©.*?\d{4}.*$/gm, '');
  cleaned = cleaned.replace(/\bcopyright\b.*?\d{4}.*$/gim, '');

  // Standard disclaimers
  cleaned = cleaned.replace(
    /This document does not constitute legal advice[^.]*\./gi,
    ''
  );
  cleaned = cleaned.replace(
    /This form has been approved by[^.]*\./gi,
    ''
  );
  cleaned = cleaned.replace(
    /All rights reserved[^.]*\./gi,
    ''
  );

  // Form/revision identifiers: "Form #RPA-123", "Rev. 01/2024", "Form ID: ABC-456"
  cleaned = cleaned.replace(/\bForm\s*#?\s*[A-Z0-9-]+\b/gi, '');
  cleaned = cleaned.replace(/\bRev\.?\s*\d{1,2}\/\d{2,4}\b/gi, '');
  cleaned = cleaned.replace(/\bForm\s+ID\s*:\s*[A-Z0-9-]+\b/gi, '');

  // Line separators: ---, ===, ___  (3 or more consecutive)
  cleaned = cleaned.replace(/^[-=_]{3,}$/gm, '');

  // Empty form field labels: "Signature: ____", "Date: ____", "Initials: ____"
  cleaned = cleaned.replace(
    /\b(Signature|Date|Initials|Print Name|Printed Name|Broker|Agent)\s*:\s*[_\s]*$/gim,
    ''
  );

  // Collapse excessive blank lines resulting from removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Extract substantive paragraph blocks, filtering out short labels and
 * all-caps section headers without meaningful content.
 */
export function extractRelevantBlocks(text: string): string {
  const blocks = text.split(/\n\n+/);

  const relevant = blocks.filter((block) => {
    const trimmed = block.trim();
    if (trimmed.length < 20) return false;
    // All-uppercase short blocks are likely section headers
    if (trimmed.length < 100 && trimmed === trimmed.toUpperCase()) return false;
    return true;
  });

  return relevant.join('\n\n');
}

/**
 * Smart truncation at sentence boundary to fit within a token budget.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('! ')
  );

  if (lastSentenceEnd > maxChars * 0.8) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }
  return truncated;
}

/**
 * Orchestrate the full preprocessing pipeline:
 *   removeBoilerplate → extractRelevantBlocks → token-based truncation
 *
 * Returns the cleaned text along with token metrics for observability.
 */
export function prepareInput(
  text: string,
  options: { maxTokens: number; operation: string }
): PreparedInput {
  const originalTokens = estimateTokens(text);

  let processed = removeBoilerplate(text);
  processed = extractRelevantBlocks(processed);
  processed = truncateToTokens(processed, options.maxTokens);

  const finalTokens = estimateTokens(processed);
  const reductionPct =
    originalTokens > 0
      ? Math.round(((originalTokens - finalTokens) / originalTokens) * 100)
      : 0;

  return {
    text: processed,
    originalTokens,
    finalTokens,
    reductionPct,
  };
}
