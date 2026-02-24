import type {
  DetectionMethod,
  DetectionPathResult,
  PageSignatureDetection,
} from '@/types/pdf';

// ── Weights ────────────────────────────────────────────────────────────────

/**
 * Path weights. Structural carries the highest weight because an
 * AcroForm /FT /Sig field is the most authoritative proof that a
 * signature location exists in the PDF.
 */
const WEIGHTS: Record<DetectionMethod, number> = {
  structural: 0.45,
  annotation: 0.25,
  keyword:    0.20,
  ocr:        0.10,
};

// ── Cross-validation ───────────────────────────────────────────────────────

/**
 * Compute the agreement score among detection paths.
 *
 * Only paths that actually had data to analyze (confidence > 0 or detected)
 * are considered "participating". Agreement measures how much the
 * participating paths agree on whether a signature is present.
 *
 * Returns a value from 0 (full disagreement) to 1 (full agreement).
 */
function computeAgreement(results: DetectionPathResult[]): number {
  // A path "participates" if it had any evidence to evaluate.
  // Paths that returned confidence 0 with no evidence simply had no
  // data — they neither agree nor disagree.
  const participating = results.filter(
    (r) => r.evidence.length > 0,
  );

  if (participating.length <= 1) {
    // Only one path had data — no cross-validation possible.
    // Return a neutral score that neither boosts nor penalizes.
    return 0.5;
  }

  const detectCount = participating.filter((r) => r.detected).length;
  const noDetectCount = participating.length - detectCount;

  // Agreement = fraction of paths on the majority side
  const majority = Math.max(detectCount, noDetectCount);
  return majority / participating.length;
}

/**
 * Compute the final confidence score for a page.
 *
 * 1. Weighted sum of each path's confidence × its weight.
 * 2. Adjusted by agreement score — consensus boosts, disagreement dampens.
 *
 * The formula is:
 *   raw = sum(confidence_i × weight_i)
 *   final = raw × (0.5 + 0.5 × agreement)
 *
 * This means:
 *   - Full agreement (1.0) → raw score preserved.
 *   - Neutral (0.5)       → 75% of raw (single-path data).
 *   - Full disagreement (0.0) → 50% of raw (heavy penalty).
 */
function computeFinalConfidence(
  results: DetectionPathResult[],
  agreement: number,
): number {
  let raw = 0;
  for (const r of results) {
    raw += r.confidence * WEIGHTS[r.method];
  }

  const adjusted = raw * (0.5 + 0.5 * agreement);
  return Math.min(Math.round(adjusted * 1000) / 1000, 1);
}

/**
 * Determine the boolean `detected` flag for the page.
 *
 * Detection is positive when:
 *   - Structural path detected (always trusted), OR
 *   - At least 2 non-structural paths detected, OR
 *   - Final confidence exceeds 0.35
 */
function computeDetected(
  results: DetectionPathResult[],
  finalConfidence: number,
): boolean {
  const structural = results.find((r) => r.method === 'structural');
  if (structural?.detected) return true;

  const otherDetections = results.filter(
    (r) => r.method !== 'structural' && r.detected,
  ).length;
  if (otherDetections >= 2) return true;

  return finalConfidence >= 0.35;
}

/**
 * Cross-validate detection path results for a single page and
 * produce the final PageSignatureDetection.
 */
export function crossValidate(
  page: number,
  results: DetectionPathResult[],
): PageSignatureDetection {
  const agreement = computeAgreement(results);
  const finalConfidence = computeFinalConfidence(results, agreement);
  const detected = computeDetected(results, finalConfidence);

  return {
    page,
    detection_methods: results,
    detected,
    agreement_score: Math.round(agreement * 1000) / 1000,
    final_confidence_score: finalConfidence,
  };
}
