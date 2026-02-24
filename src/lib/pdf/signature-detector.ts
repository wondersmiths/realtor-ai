import type {
  PdfDeepParseResult,
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

const DETECTOR_VERSION = '1.0.0';

/**
 * Split extracted text into per-page strings.
 * pdf-parse separates pages with form-feed characters (\f).
 */
function splitTextByPage(text: string, pageCount: number): string[] {
  const parts = text.split('\f');

  // Pad or trim to match actual page count
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(parts[i] ?? '');
  }
  return pages;
}

/**
 * Run multi-path signature detection on a PDF.
 *
 * Executes four independent detection paths per page:
 *   1. Structural (AcroForm /FT /Sig fields)          – weight 0.45
 *   2. Annotation (ink objects, geometric heuristics)  – weight 0.25
 *   3. Keyword + layout proximity (text patterns)      – weight 0.20
 *   4. OCR fallback (sparse-text / degraded patterns)  – weight 0.10
 *
 * Then cross-validates the results to produce agreement and confidence
 * scores per page.
 *
 * @param buffer    Raw PDF file bytes
 * @param extractedText  Text previously extracted by pdf-parse
 * @param deepParse Pre-computed deep parse result (avoids re-parsing)
 */
export async function detectSignatures(
  buffer: Buffer,
  extractedText: string,
  deepParse?: PdfDeepParseResult,
): Promise<SignatureDetectionResult> {
  // Reuse or compute deep parse
  const parsed = deepParse ?? await deepParsePdf(buffer);
  const pageCount = parsed.pageCount;

  // Split text into per-page segments
  const pageTexts = splitTextByPage(extractedText, pageCount);

  // Run all 4 detection paths per page, then cross-validate
  const summary = { structuralCount: 0, annotationCount: 0, keywordCount: 0, ocrCount: 0 };
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const pageNum = i + 1;
    const text = pageTexts[i];

    const structural = detectStructural(parsed, pageNum);
    const annotation = detectAnnotation(parsed, pageNum);
    const keyword    = detectKeyword(text, pageNum);
    const ocr        = detectOcr(text, parsed, pageNum);

    const result = crossValidate(pageNum, [structural, annotation, keyword, ocr]);
    pages.push(result);

    if (result.detected) {
      if (structural.detected)  summary.structuralCount++;
      if (annotation.detected)  summary.annotationCount++;
      if (keyword.detected)     summary.keywordCount++;
      if (ocr.detected)         summary.ocrCount++;
    }
  }

  return {
    pages,
    totalSignaturesDetected: pages.filter((p) => p.detected).length,
    detectionSummary: summary,
    detectorVersion: DETECTOR_VERSION,
    detectedAt: new Date().toISOString(),
  };
}
