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
