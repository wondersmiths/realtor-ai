// ──────────────────────────────────────────────
// Prompt builders for each AI operation.
// Each returns { system, user } ready for the provider.
// All prompts instruct the model to respond with JSON only.
// ──────────────────────────────────────────────

export interface PromptPair {
  system: string;
  user: string;
}

/**
 * Build the prompt for a full document compliance review.
 */
export function buildDocumentReviewPrompt(
  documentText: string,
  documentName: string
): PromptPair {
  return {
    system: `You are an expert real-estate compliance reviewer. Your task is to analyze a document and identify legal, regulatory, and procedural compliance issues.

Focus areas:
- Missing required clauses, addenda, or disclosures
- Fair Housing Act violations (discriminatory language targeting protected classes)
- Ambiguous or legally problematic language
- Missing signature blocks, date fields, or witness requirements
- State-specific compliance gaps
- Accuracy of legal descriptions and financial terms

Return your analysis as a JSON object with this exact schema (no markdown fencing, no explanation outside the JSON):
{
  "score": <integer 0-100, where 100 is fully compliant>,
  "findings": [
    {
      "type": "<category: missing_clause | fair_housing | ambiguous_language | missing_signature | state_requirement | financial_error | other>",
      "severity": "<info | warning | error | critical>",
      "message": "<clear description of the issue>",
      "location": "<quote or section reference where issue was found>",
      "suggestion": "<actionable recommendation to resolve the issue>"
    }
  ],
  "summary": "<2-3 sentence overall compliance summary>"
}

IMPORTANT:
- Be thorough but avoid false positives -- only flag genuine issues.
- Severity guide: info = best-practice suggestion, warning = should fix before closing, error = regulatory risk, critical = immediate legal exposure.
- If the document is fully compliant, return score 100 with an empty findings array.`,

    user: `Review the following document for compliance.

Document name: ${documentName}

--- DOCUMENT TEXT ---
${documentText.slice(0, 15000)}
--- END ---`,
  };
}

/**
 * Build the prompt for Fair Housing Act language validation.
 */
export function buildFairHousingPrompt(
  text: string,
  context?: string
): PromptPair {
  const contextLabel = context
    ? `Context: This text is from a ${context}.`
    : 'Context: Real-estate listing or communication.';

  return {
    system: `You are a Fair Housing Act compliance specialist. Analyze the provided text for language that could violate federal and state fair housing laws.

Protected classes under the Fair Housing Act:
- Race
- Color
- Religion
- National origin
- Sex (including gender identity and sexual orientation)
- Familial status (families with children under 18, pregnant persons)
- Disability (physical and mental)

Look for:
1. Explicit discriminatory statements (e.g., "no children allowed")
2. Implicit or coded discriminatory language (e.g., "executive neighborhood", "walking distance only")
3. Steering language that implies preference for or against protected classes
4. Missing equal-opportunity disclaimers where required

Return your analysis as a JSON object with this exact schema (no markdown fencing):
{
  "violations": [
    {
      "text": "<exact problematic text>",
      "category": "<protected class category>",
      "severity": "<low | medium | high | critical>",
      "explanation": "<why this may violate fair housing law>",
      "suggestion": "<compliant alternative language>"
    }
  ],
  "score": <integer 0-100 where 100 is fully compliant>,
  "summary": "<1-2 sentence overall assessment>"
}

Severity guide:
- low: borderline language that could be improved
- medium: likely problematic, should be revised
- high: clear fair housing concern, must be changed
- critical: explicit violation with immediate legal risk`,

    user: `${contextLabel}

Analyze this text for Fair Housing Act compliance:

${text.slice(0, 15000)}`,
  };
}

/**
 * Build the prompt for listing compliance review.
 */
export function buildListingCompliancePrompt(listing: {
  address: string;
  description?: string | null;
  price?: number | null;
  city?: string;
  state?: string;
  zip_code?: string;
  property_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  mls_number?: string | null;
}): PromptPair {
  const parts = [
    listing.description || '',
    `Address: ${listing.address}${listing.city ? `, ${listing.city}` : ''}${listing.state ? `, ${listing.state}` : ''} ${listing.zip_code || ''}`,
    listing.property_type ? `Property Type: ${listing.property_type}` : '',
    listing.price != null ? `Price: $${listing.price.toLocaleString()}` : '',
    listing.bedrooms != null ? `Bedrooms: ${listing.bedrooms}` : '',
    listing.bathrooms != null ? `Bathrooms: ${listing.bathrooms}` : '',
    listing.square_feet != null ? `Square Feet: ${listing.square_feet.toLocaleString()}` : '',
    listing.mls_number ? `MLS#: ${listing.mls_number}` : '',
  ].filter(Boolean);

  const stateLabel = listing.state || 'the applicable state';

  return {
    system: `You are a real-estate listing compliance expert. Review the listing for regulatory and legal compliance issues.

Check for:
1. Fair Housing Act violations (discriminatory or preferential language)
2. Missing required information per ${stateLabel} regulations
3. Truth-in-advertising issues (misleading claims, unsubstantiated superlatives)
4. State-specific listing requirements for ${stateLabel}
5. MLS compliance (required fields, formatting)
6. Equal Housing Opportunity compliance

Return your analysis as a JSON object (no markdown fencing):
{
  "score": <integer 0-100>,
  "findings": [
    {
      "type": "<finding_type>",
      "severity": "<info | warning | error | critical>",
      "message": "<description of the issue>",
      "location": "<where in the listing>",
      "suggestion": "<how to fix>"
    }
  ],
  "recommendations": [
    "<string: actionable improvement recommendation>"
  ]
}`,

    user: `Review this listing for compliance:

${parts.join('\n')}`,
  };
}

/**
 * Build the prompt for generating an overall compliance summary from
 * multiple individual compliance check results.
 */
export function buildComplianceSummaryPrompt(
  checks: Array<{
    type: string;
    score: number | null;
    findings: Array<{ type: string; severity: string; message: string }>;
    summary?: string | null;
  }>
): PromptPair {
  const checksJson = JSON.stringify(checks, null, 2);

  return {
    system: `You are a real-estate compliance analyst. Given an array of individual compliance check results, produce an overall compliance summary.

Return a JSON object (no markdown fencing):
{
  "overallScore": <integer 0-100, weighted average of input scores>,
  "areas": [
    {
      "name": "<compliance area name>",
      "score": <integer 0-100>,
      "status": "<pass | warning | fail>",
      "issueCount": <number of findings in this area>,
      "topIssue": "<most severe finding summary or null>"
    }
  ],
  "recommendations": [
    "<string: prioritized recommendation>"
  ]
}

Prioritize recommendations by severity (critical first). Limit to the top 5 most impactful recommendations.`,

    user: `Generate an overall compliance summary from these check results:

${checksJson}`,
  };
}
