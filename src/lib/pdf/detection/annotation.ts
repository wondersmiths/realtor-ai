import type {
  PdfDeepParseResult,
  DetectionPathResult,
  PdfBoundingBox,
} from '@/types/pdf';

/**
 * Minimum area (in PDF points squared) for an ink annotation
 * to be considered a plausible handwritten signature.
 * Filters out tiny stray marks and stamps.
 */
const MIN_SIG_AREA = 400; // ~20x20 pt

/**
 * Maximum area — enormous ink blobs are likely drawings, not signatures.
 */
const MAX_SIG_AREA = 150_000; // ~300x500 pt

/** Typical handwritten-signature aspect ratio range (width / height). */
const MIN_ASPECT = 0.8;
const MAX_ASPECT = 8.0;

function boxArea(box: PdfBoundingBox): number {
  return Math.abs(box.x2 - box.x1) * Math.abs(box.y2 - box.y1);
}

function boxAspect(box: PdfBoundingBox): number {
  const w = Math.abs(box.x2 - box.x1);
  const h = Math.abs(box.y2 - box.y1);
  if (h === 0) return Infinity;
  return w / h;
}

/**
 * Path 2: Annotation detection.
 *
 * Looks for ink annotations on the page that match the geometric
 * profile of a handwritten signature (reasonable size, landscape-ish
 * aspect ratio, has an appearance stream).
 */
export function detectAnnotation(
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionPathResult {
  const evidence: string[] = [];
  let maxConfidence = 0;
  let bestBox: DetectionPathResult['boundingBox'] = null;

  const inkOnPage = deepParse.inkAnnotations.filter(
    (a) => a.pageNumber === page,
  );

  if (inkOnPage.length === 0) {
    return {
      method: 'annotation',
      detected: false,
      confidence: 0,
      evidence: [],
      boundingBox: null,
    };
  }

  for (const ink of inkOnPage) {
    let conf = 0.3; // base: something is drawn
    const notes: string[] = ['Ink annotation'];

    if (ink.boundingBox) {
      const area = boxArea(ink.boundingBox);
      const aspect = boxAspect(ink.boundingBox);

      if (area >= MIN_SIG_AREA && area <= MAX_SIG_AREA) {
        conf += 0.25;
        notes.push(`area=${Math.round(area)}pt²`);
      } else {
        // Outside typical size — less likely a signature
        notes.push(`area=${Math.round(area)}pt² (atypical)`);
      }

      if (aspect >= MIN_ASPECT && aspect <= MAX_ASPECT) {
        conf += 0.15;
        notes.push(`aspect=${aspect.toFixed(1)}`);
      }

      // Position in lower portion of page often indicates signature area
      // PDF coordinate origin is bottom-left; typical pages are ~792pt tall
      if (ink.boundingBox.y1 < 300 && ink.boundingBox.y2 < 400) {
        conf += 0.1;
        notes.push('lower-page position');
      }
    }

    if (ink.hasAppearanceStream) {
      conf += 0.15;
      notes.push('has appearance stream');
    }

    evidence.push(notes.join(', '));

    if (conf > maxConfidence) {
      maxConfidence = conf;
      bestBox = ink.boundingBox;
    }
  }

  if (inkOnPage.length > 1) {
    evidence.push(`${inkOnPage.length} ink annotations total`);
  }

  return {
    method: 'annotation',
    detected: maxConfidence > 0.3,
    confidence: Math.min(maxConfidence, 1),
    evidence,
    boundingBox: bestBox,
  };
}
