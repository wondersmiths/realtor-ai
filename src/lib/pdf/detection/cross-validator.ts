import type {
  DetectionMethod,
  DetectionHit,
  DetectionPathResult,
  SignatureConfidence,
  PageSignatureDetection,
  PdfBoundingBox,
} from '@/types/pdf';

// ── Confidence model ───────────────────────────────────────────────────────

/** Base confidence when a method is the primary (strongest) detector. */
const METHOD_BASE: Record<DetectionMethod, number> = {
  structural: 0.99,
  annotation: 0.95,
  keyword:    0.80,
  ocr:        0.70,
};

/** Bonus added for each additional corroborating method. */
const AGREEMENT_BONUS = 0.02;

/** Hard cap when OCR is the only detection method. */
const OCR_ONLY_CAP = 0.75;

/** Confidence threshold below which manual review is recommended. */
const MANUAL_REVIEW_THRESHOLD = 0.85;

/** Method priority — higher index = higher priority. */
const METHOD_PRIORITY: DetectionMethod[] = ['ocr', 'keyword', 'annotation', 'structural'];

/** Distance threshold (PDF points) for grouping two bounding boxes. */
const PROXIMITY_THRESHOLD = 60;

// ── Spatial helpers ────────────────────────────────────────────────────────

function boxCenter(box: PdfBoundingBox): { cx: number; cy: number } {
  return { cx: (box.x1 + box.x2) / 2, cy: (box.y1 + box.y2) / 2 };
}

function boxesNear(a: PdfBoundingBox, b: PdfBoundingBox): boolean {
  const ca = boxCenter(a);
  const cb = boxCenter(b);
  return (
    Math.abs(ca.cx - cb.cx) < PROXIMITY_THRESHOLD &&
    Math.abs(ca.cy - cb.cy) < PROXIMITY_THRESHOLD
  );
}

// ── Signature grouping ─────────────────────────────────────────────────────

interface SignatureGroup {
  hits: DetectionHit[];
  methods: Set<DetectionMethod>;
  boundingBox: PdfBoundingBox | null;
}

/**
 * Group hits into signature candidates using spatial proximity.
 *
 * "Anchor" hits (structural, annotation) have bounding boxes and
 * represent discrete signatures. They're grouped if their boxes overlap.
 *
 * "Support" hits (keyword, OCR) have no bounding box. They corroborate
 * every anchor group on the page. If no anchors exist, support hits
 * form a single standalone group.
 */
function groupHits(hits: DetectionHit[]): SignatureGroup[] {
  const anchors = hits.filter((h) => h.boundingBox !== null);
  const supports = hits.filter((h) => h.boundingBox === null);

  const groups: SignatureGroup[] = [];

  // Cluster anchors by spatial proximity
  for (const anchor of anchors) {
    let merged = false;
    for (const group of groups) {
      if (
        group.boundingBox &&
        anchor.boundingBox &&
        boxesNear(group.boundingBox, anchor.boundingBox)
      ) {
        group.hits.push(anchor);
        group.methods.add(anchor.method);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({
        hits: [anchor],
        methods: new Set([anchor.method]),
        boundingBox: anchor.boundingBox,
      });
    }
  }

  // Attach support hits to all anchor groups
  if (groups.length > 0) {
    for (const support of supports) {
      for (const group of groups) {
        group.hits.push(support);
        group.methods.add(support.method);
      }
    }
  } else if (supports.length > 0) {
    // No anchors — support hits form a standalone group
    groups.push({
      hits: supports,
      methods: new Set(supports.map((s) => s.method)),
      boundingBox: null,
    });
  }

  return groups;
}

// ── Per-signature scoring ──────────────────────────────────────────────────

function scoreSignature(
  group: SignatureGroup,
  page: number,
  index: number,
): SignatureConfidence {
  const methods = Array.from(group.methods);

  // Primary method = highest-priority method in the group
  const primaryMethod = METHOD_PRIORITY.slice().reverse().find(
    (m) => group.methods.has(m),
  )!;

  // Base confidence from primary method
  let confidence = METHOD_BASE[primaryMethod];

  // +0.02 per additional corroborating method
  const additionalMethods = methods.length - 1;
  confidence += additionalMethods * AGREEMENT_BONUS;

  // OCR-only hard cap
  if (methods.length === 1 && methods[0] === 'ocr') {
    confidence = Math.min(confidence, OCR_ONLY_CAP);
  }

  // Clamp to [0, 1]
  confidence = Math.min(Math.round(confidence * 1000) / 1000, 1);

  const reviewStatus =
    confidence < MANUAL_REVIEW_THRESHOLD
      ? 'Manual Review Recommended'
      : 'Confident';

  // Collect evidence from all hits in the group
  const evidence = group.hits.flatMap((h) => h.evidence);

  // Pick the best field name if any structural hit has one
  const fieldName = group.hits.find((h) => h.fieldName)?.fieldName;

  return {
    signatureId: `p${page}-sig${index}${fieldName ? `-${fieldName}` : ''}`,
    page,
    confidence,
    reviewStatus,
    primaryMethod,
    contributingMethods: methods,
    boundingBox: group.boundingBox,
    evidence,
  };
}

// ── Method summary ─────────────────────────────────────────────────────────

/**
 * Derive a DetectionPathResult per method from the raw hits
 * (backward-compatible summary for detection_methods[]).
 */
function summarizeMethods(
  hits: DetectionHit[],
): DetectionPathResult[] {
  const allMethods: DetectionMethod[] = ['structural', 'annotation', 'keyword', 'ocr'];
  return allMethods.map((method) => {
    const methodHits = hits.filter((h) => h.method === method);
    if (methodHits.length === 0) {
      return {
        method,
        detected: false,
        confidence: 0,
        evidence: [],
        boundingBox: null,
      };
    }
    // Pick the best hit for the summary
    const best = methodHits.reduce((a, b) =>
      a.confidence >= b.confidence ? a : b,
    );
    return {
      method,
      detected: true,
      confidence: best.confidence,
      evidence: methodHits.flatMap((h) => h.evidence),
      boundingBox: best.boundingBox,
    };
  });
}

// ── Page-level agreement ───────────────────────────────────────────────────

function computeAgreement(signatures: SignatureConfidence[]): number {
  if (signatures.length === 0) return 0;

  // Agreement = how many distinct methods contributed across all signatures
  const allMethods = new Set(signatures.flatMap((s) => s.contributingMethods));
  // Normalize: 1 method = 0.25, 2 = 0.5, 3 = 0.75, 4 = 1.0
  return Math.min(allMethods.size / 4, 1);
}

function computePageConfidence(signatures: SignatureConfidence[]): number {
  if (signatures.length === 0) return 0;
  // Page confidence = max confidence among its signatures
  return Math.max(...signatures.map((s) => s.confidence));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Cross-validate detection hits for a single page.
 *
 * Groups hits into per-signature candidates, scores each using
 * the base-weight + agreement-bonus model, and produces the
 * final PageSignatureDetection.
 */
export function crossValidate(
  page: number,
  hits: DetectionHit[],
): PageSignatureDetection {
  const groups = groupHits(hits);
  const signatures = groups.map((g, idx) => scoreSignature(g, page, idx));
  const detectionMethods = summarizeMethods(hits);

  const agreement = computeAgreement(signatures);
  const finalConfidence = computePageConfidence(signatures);
  const detected = signatures.length > 0;

  return {
    page,
    detection_methods: detectionMethods,
    signatures,
    detected,
    agreement_score: Math.round(agreement * 1000) / 1000,
    final_confidence_score: finalConfidence,
  };
}
