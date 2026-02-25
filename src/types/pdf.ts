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
  reportSummary: string;
}

// ── PDF Optimization Engine ─────────────────────────────────────────────────

export type PdfOptimizationRecommendation =
  | 'none'
  | 'compress'
  | 'split'
  | 'compress_and_split';

/** Metadata fields extracted from the PDF Info dictionary. */
export interface PdfMetadataInfo {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  estimatedSizeBytes: number;
}

/** Analysis result describing the PDF's current state relative to a size threshold. */
export interface PdfOptimizationAnalysis {
  originalSizeBytes: number;
  pageCount: number;
  isEncrypted: boolean;
  metadata: PdfMetadataInfo;
  thresholdBytes: number;
  exceedsThreshold: boolean;
  recommendation: PdfOptimizationRecommendation;
  reason: string;
}

/** Result of compressing a PDF buffer. */
export interface PdfCompressionResult {
  buffer: Buffer;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number;
  usedObjectStreams: boolean;
  strippedMetadata: boolean;
  meetsThreshold: boolean;
}

/** A single part produced by splitting a PDF. */
export interface PdfSplitPart {
  buffer: Buffer;
  startPage: number;
  endPage: number;
  pageCount: number;
  sizeBytes: number;
  label: string;
}

/** Result of splitting a PDF into multiple parts. */
export interface PdfSplitResult {
  parts: PdfSplitPart[];
  totalParts: number;
  originalPageCount: number;
  originalSizeBytes: number;
  allPartsUnderThreshold: boolean;
  splitMode: 'auto' | 'user-specified';
}

/** Full optimization result combining analysis, compression, and optional split. */
export interface PdfOptimizationResult {
  analysis: PdfOptimizationAnalysis;
  compression: PdfCompressionResult | null;
  split: PdfSplitResult | null;
  optimizedBuffer: Buffer;
  finalSizeBytes: number;
  meetsThreshold: boolean;
  actionTaken: PdfOptimizationRecommendation;
  version: string;
  timestamp: string;
}

/** Options for the optimization engine. */
export interface PdfOptimizationOptions {
  thresholdBytes?: number;
  splitAtPages?: number[];
  maxPagesPerPart?: number;
  analyzeOnly?: boolean;
  skipSplit?: boolean;
}

/** Serializable subset of PdfOptimizationResult (no Buffers) for JSON storage. */
export interface PdfOptimizationMetadata {
  analysis: PdfOptimizationAnalysis;
  compression: Omit<PdfCompressionResult, 'buffer'> | null;
  split: {
    totalParts: number;
    originalPageCount: number;
    originalSizeBytes: number;
    allPartsUnderThreshold: boolean;
    splitMode: 'auto' | 'user-specified';
    parts: Omit<PdfSplitPart, 'buffer'>[];
  } | null;
  finalSizeBytes: number;
  meetsThreshold: boolean;
  actionTaken: PdfOptimizationRecommendation;
  splitPartPaths?: string[];
  version: string;
  timestamp: string;
}
