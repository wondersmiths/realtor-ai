export { deepParsePdf } from './deep-parser';
export { detectSignatures } from './signature-detector';
export { optimizePdf, analyzePdf, compressPdf, splitPdf } from './optimizer';
export type {
  PdfBoundingBox,
  PdfSignatureField,
  PdfInkAnnotation,
  PdfAcroFormInfo,
  PdfDeepParseResult,
  DetectionMethod,
  DetectionHit,
  DetectionPathResult,
  ReviewStatus,
  SignatureConfidence,
  PageSignatureDetection,
  SignatureDetectionResult,
  PdfOptimizationRecommendation,
  PdfMetadataInfo,
  PdfOptimizationAnalysis,
  PdfCompressionResult,
  PdfSplitPart,
  PdfSplitResult,
  PdfOptimizationResult,
  PdfOptimizationOptions,
  PdfOptimizationMetadata,
} from '@/types/pdf';
