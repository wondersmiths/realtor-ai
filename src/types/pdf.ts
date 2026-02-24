/** Bounding box extracted from a PDF /Rect array. */
export interface PdfBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A signature field discovered via AcroForm /Fields or page annotations. */
export interface PdfSignatureField {
  fieldName: string;
  fieldType: string;
  pageNumber: number | null;
  boundingBox: PdfBoundingBox | null;
  hasAppearanceStream: boolean;
  isSigned: boolean;
  annotationSubtype: string | null;
  objectRef: string;
}

/** An ink annotation found on a page. */
export interface PdfInkAnnotation {
  pageNumber: number | null;
  boundingBox: PdfBoundingBox | null;
  hasAppearanceStream: boolean;
  objectRef: string;
}

/** Summary of the AcroForm dictionary in the PDF catalog. */
export interface PdfAcroFormInfo {
  exists: boolean;
  totalFieldCount: number;
  hasSigFlags: boolean;
  sigFlagsValue: number | null;
}

/** Full result returned by deepParsePdf. */
export interface PdfDeepParseResult {
  pageCount: number;
  acroForm: PdfAcroFormInfo;
  signatureFields: PdfSignatureField[];
  signatureWidgets: PdfSignatureField[];
  inkAnnotations: PdfInkAnnotation[];
  signatureFieldCount: number;
  signatureWidgetCount: number;
  inkAnnotationCount: number;
  parserVersion: string;
  parsedAt: string;
}

// ── Multi-path signature detection ─────────────────────────────────────────

export type DetectionMethod = 'structural' | 'annotation' | 'keyword' | 'ocr';

export type ReviewStatus = 'Confident' | 'Manual Review Recommended';

/** A single hit from one detection path — one per discrete signature candidate. */
export interface DetectionHit {
  method: DetectionMethod;
  confidence: number;
  boundingBox: PdfBoundingBox | null;
  evidence: string[];
  fieldName?: string;
}

/** Per-method summary derived from hits (kept for backward compat). */
export interface DetectionPathResult {
  method: DetectionMethod;
  detected: boolean;
  confidence: number;
  evidence: string[];
  boundingBox: PdfBoundingBox | null;
}

/** Per-signature confidence with review status. */
export interface SignatureConfidence {
  signatureId: string;
  page: number;
  confidence: number;
  reviewStatus: ReviewStatus;
  primaryMethod: DetectionMethod;
  contributingMethods: DetectionMethod[];
  boundingBox: PdfBoundingBox | null;
  evidence: string[];
}

/** Per-page signature detection with cross-validated scoring. */
export interface PageSignatureDetection {
  page: number;
  detection_methods: DetectionPathResult[];
  signatures: SignatureConfidence[];
  detected: boolean;
  agreement_score: number;
  final_confidence_score: number;
}

/** Full result of multi-path signature detection across all pages. */
export interface SignatureDetectionResult {
  pages: PageSignatureDetection[];
  signatures: SignatureConfidence[];
  totalSignaturesDetected: number;
  manualReviewCount: number;
  detectionSummary: {
    structuralCount: number;
    annotationCount: number;
    keywordCount: number;
    ocrCount: number;
  };
  detectorVersion: string;
  detectedAt: string;
}
