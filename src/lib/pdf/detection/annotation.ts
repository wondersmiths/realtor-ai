import type {
  PdfDeepParseResult,
  PdfBoundingBox,
  DetectionHit,
} from '@/types/pdf';

/**
 * Minimum area (in PDF points squared) for an ink annotation
 * to be considered a plausible handwritten signature.
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
 * Returns one DetectionHit per ink annotation on the page that
 * passes geometric plausibility checks for a handwritten signature.
 */
export function detectAnnotation(
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionHit[] {
  const hits: DetectionHit[] = [];

  const inkOnPage = deepParse.inkAnnotations.filter(
    (a) => a.pageNumber === page,
  );

  for (const ink of inkOnPage) {
    let conf = 0.3; // base: something is drawn
    const evidence: string[] = ['Ink annotation'];

    if (ink.boundingBox) {
      const area = boxArea(ink.boundingBox);
      const aspect = boxAspect(ink.boundingBox);

      if (area >= MIN_SIG_AREA && area <= MAX_SIG_AREA) {
        conf += 0.25;
        evidence.push(`area=${Math.round(area)}pt²`);
      } else {
        evidence.push(`area=${Math.round(area)}pt² (atypical)`);
      }

      if (aspect >= MIN_ASPECT && aspect <= MAX_ASPECT) {
        conf += 0.15;
        evidence.push(`aspect=${aspect.toFixed(1)}`);
      }

      // Lower portion of page often indicates signature area
      if (ink.boundingBox.y1 < 300 && ink.boundingBox.y2 < 400) {
        conf += 0.1;
        evidence.push('lower-page position');
      }
    }

    if (ink.hasAppearanceStream) {
      conf += 0.15;
      evidence.push('has appearance stream');
    }

    // Only emit a hit if it passes the minimum plausibility bar
    if (conf > 0.3) {
      hits.push({
        method: 'annotation',
        confidence: Math.min(conf, 1),
        boundingBox: ink.boundingBox,
        evidence,
      });
    }
  }

  return hits;
}
