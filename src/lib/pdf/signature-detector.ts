import type {
  PdfDeepParseResult,
  DetectionHit,
  SignatureDetectionResult,
} from '@/types/pdf';

import { deepParsePdf } from './deep-parser';
import {
  detectStructural,
  detectAnnotation,
  detectKeyword,
  detectOcr,
  crossValidate,
} from './detection';
import { SIGNATURE_REPORT_MESSAGES } from '@/lib/constants';

const DETECTOR_VERSION = '2.0.0';

/**
 * Split extracted text into per-page strings.
 * pdf-parse separates pages with form-feed characters (\f).
 */
function splitTextByPage(text: string, pageCount: number): string[] {
  const parts = text.split('\f');

  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(parts[i] ?? '');
  }
  return pages;
}

/**
 * Run multi-path signature detection on a PDF.
 *
 * Executes four independent detection paths per page, groups hits
 * into per-signature candidates, and scores each using:
 *   - AcroForm (structural) base = 0.99
 *   - Annotation base = 0.95
 *   - Multi-method agreement bonus = +0.02 per additional method
 *   - OCR-only hard cap = 0.75
 *   - Confidence < 0.85 → "Manual Review Recommended"
 *
 * @param buffer        Raw PDF file bytes
 * @param extractedText Text previously extracted by pdf-parse
 * @param deepParse     Pre-computed deep parse result (avoids re-parsing)
 */
export async function detectSignatures(
  buffer: Buffer,
  extractedText: string,
  deepParse?: PdfDeepParseResult,
): Promise<SignatureDetectionResult> {
  const parsed = deepParse ?? await deepParsePdf(buffer);
  const pageCount = parsed.pageCount;
  const pageTexts = splitTextByPage(extractedText, pageCount);

  const summary = { structuralCount: 0, annotationCount: 0, keywordCount: 0, ocrCount: 0 };
  const pages = [];
  let manualReviewCount = 0;

  for (let i = 0; i < pageCount; i++) {
    const pageNum = i + 1;
    const text = pageTexts[i];

    // Collect all hits from the four detection paths
    const allHits: DetectionHit[] = [
      ...detectStructural(parsed, pageNum),
      ...detectAnnotation(parsed, pageNum),
      ...detectKeyword(text, pageNum),
      ...detectOcr(text, parsed, pageNum),
    ];

    const result = crossValidate(pageNum, allHits);
    pages.push(result);

    // Tally per-method counts (only for pages with detections)
    if (result.detected) {
      const methods = new Set(result.signatures.flatMap((s) => s.contributingMethods));
      if (methods.has('structural'))  summary.structuralCount++;
      if (methods.has('annotation'))  summary.annotationCount++;
      if (methods.has('keyword'))     summary.keywordCount++;
      if (methods.has('ocr'))         summary.ocrCount++;
    }

    // Count signatures needing manual review
    manualReviewCount += result.signatures.filter(
      (s) => s.reviewStatus === 'Manual Review Recommended',
    ).length;
  }

  // Flatten all signatures across pages for top-level access
  const allSignatures = pages.flatMap((p) => p.signatures);

  const reportSummary = [
    SIGNATURE_REPORT_MESSAGES.completed,
    SIGNATURE_REPORT_MESSAGES.flagged,
    SIGNATURE_REPORT_MESSAGES.humanReview,
  ].join('\n');

  return {
    pages,
    signatures: allSignatures,
    totalSignaturesDetected: allSignatures.length,
    manualReviewCount,
    detectionSummary: summary,
    detectorVersion: DETECTOR_VERSION,
    detectedAt: new Date().toISOString(),
    reportSummary,
  };
}
