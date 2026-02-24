import type { DetectionPathResult, PdfDeepParseResult } from '@/types/pdf';

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
  // These patterns tolerate common OCR misreads (e.g. "5ign" for "Sign")
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
 * This path fires when a page has sparse text (indicating a scanned
 * document). It applies fuzzy / OCR-tolerant patterns to whatever text
 * was recovered and also checks structural hints (ink annotations,
 * appearance streams) that may indicate a drawn signature on a scan.
 *
 * If the page has normal text density, this path defers to the keyword
 * detector and returns no detection, avoiding double-counting.
 */
export function detectOcr(
  pageText: string,
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionPathResult {
  const textLen = pageText.trim().length;

  // Normal text density — let keyword detector handle it
  if (textLen > PARTIAL_OCR_THRESHOLD) {
    return {
      method: 'ocr',
      detected: false,
      confidence: 0,
      evidence: ['sufficient text density, deferring to keyword path'],
      boundingBox: null,
    };
  }

  const evidence: string[] = [];
  let totalScore = 0;

  // Flag text quality
  if (textLen <= SPARSE_TEXT_THRESHOLD) {
    evidence.push(`very sparse text (${textLen} chars) — likely scanned`);
    // Being on a scanned page itself is a mild signal when combined
    // with other indicators
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

  // Structural hints on scanned pages: ink annotations strongly suggest
  // a drawn signature, especially on a page with little extractable text
  const inkOnPage = deepParse.inkAnnotations.filter((a) => a.pageNumber === page);
  if (inkOnPage.length > 0) {
    evidence.push(`${inkOnPage.length} ink annotation(s) on sparse-text page`);
    totalScore += 0.30;
  }

  // Appearance streams on signature widgets/fields suggest a visual
  // signature was placed, even if text extraction couldn't read it
  const sigOnPage = [
    ...deepParse.signatureFields.filter((f) => f.pageNumber === page && f.hasAppearanceStream),
    ...deepParse.signatureWidgets.filter((w) => w.pageNumber === page && w.hasAppearanceStream),
  ];
  if (sigOnPage.length > 0) {
    evidence.push(`${sigOnPage.length} sig field(s) with appearance stream on sparse page`);
    totalScore += 0.25;
  }

  const confidence = Math.min(totalScore, 1);

  return {
    method: 'ocr',
    detected: confidence >= 0.20,
    confidence,
    evidence,
    boundingBox: null,
  };
}
