import type { DetectionHit, PdfDeepParseResult } from '@/types/pdf';

/**
 * Characters-per-page threshold below which a page is considered
 * "sparse" — likely a scanned image with limited or no OCR text.
 */
const SPARSE_TEXT_THRESHOLD = 50;

/**
 * When a page has moderate text but well below normal density,
 * it may be partially OCR'd.
 */
const PARTIAL_OCR_THRESHOLD = 200;

/** Signature-adjacent patterns that survive poor OCR quality. */
const OCR_SIGNATURE_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /[s5][il1]gn/i,                      weight: 0.25, label: 'OCR "sign" variant' },
  { pattern: /[s5][il1]gnat/i,                     weight: 0.30, label: 'OCR "signat..." variant' },
  { pattern: /_{3,}/,                              weight: 0.15, label: 'underscore run' },
  { pattern: /[xX]\s*[_\-]{2,}/,                  weight: 0.20, label: 'X-mark line' },
  { pattern: /\bdate\b/i,                          weight: 0.05, label: '"date"' },
  { pattern: /\bwitn/i,                            weight: 0.10, label: 'OCR "witn..." variant' },
  { pattern: /\bnota/i,                            weight: 0.10, label: 'OCR "nota..." variant' },
  { pattern: /\binitial/i,                         weight: 0.15, label: '"initial"' },
];

/**
 * Path 4: OCR fallback detection.
 *
 * Only fires when a page has sparse text (< 200 chars), indicating a
 * scanned document. Returns a single aggregate DetectionHit per page.
 * Defers to keyword path on pages with normal text density.
 */
export function detectOcr(
  pageText: string,
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionHit[] {
  const textLen = pageText.trim().length;

  // Normal text density — let keyword detector handle it
  if (textLen > PARTIAL_OCR_THRESHOLD) return [];

  const evidence: string[] = [];
  let totalScore = 0;

  if (textLen <= SPARSE_TEXT_THRESHOLD) {
    evidence.push(`very sparse text (${textLen} chars) — likely scanned`);
  } else {
    evidence.push(`partial text (${textLen} chars) — possible partial OCR`);
  }

  // Run OCR-tolerant patterns on whatever text exists
  if (textLen > 0) {
    for (const entry of OCR_SIGNATURE_PATTERNS) {
      if (entry.pattern.test(pageText)) {
        evidence.push(entry.label);
        totalScore += entry.weight;
      }
    }
  }

  // Structural hints on scanned pages
  const inkOnPage = deepParse.inkAnnotations.filter((a) => a.pageNumber === page);
  if (inkOnPage.length > 0) {
    evidence.push(`${inkOnPage.length} ink annotation(s) on sparse-text page`);
    totalScore += 0.30;
  }

  const sigOnPage = [
    ...deepParse.signatureFields.filter((f) => f.pageNumber === page && f.hasAppearanceStream),
    ...deepParse.signatureWidgets.filter((w) => w.pageNumber === page && w.hasAppearanceStream),
  ];
  if (sigOnPage.length > 0) {
    evidence.push(`${sigOnPage.length} sig field(s) with appearance stream on sparse page`);
    totalScore += 0.25;
  }

  if (totalScore < 0.20) return [];

  return [{
    method: 'ocr',
    confidence: Math.min(totalScore, 1),
    boundingBox: null,
    evidence,
  }];
}
