import type {
  PdfDeepParseResult,
  DetectionPathResult,
} from '@/types/pdf';

/**
 * Path 1: Structural detection via AcroForm.
 *
 * Inspects the deep-parsed PDF structure for /FT /Sig fields
 * and signature widgets. This is the most reliable detection
 * method — a signature field in the AcroForm is definitive.
 */
export function detectStructural(
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionPathResult {
  const evidence: string[] = [];
  let maxConfidence = 0;
  let bestBox: DetectionPathResult['boundingBox'] = null;

  // Check AcroForm-level signals
  if (deepParse.acroForm.exists && deepParse.acroForm.hasSigFlags) {
    evidence.push(`AcroForm SigFlags=${deepParse.acroForm.sigFlagsValue}`);
  }

  // Signature fields from AcroForm /Fields walk
  const fieldsOnPage = deepParse.signatureFields.filter(
    (f) => f.pageNumber === page,
  );
  for (const field of fieldsOnPage) {
    const parts = [`AcroForm field "${field.fieldName}"`];
    if (field.isSigned) parts.push('(signed)');
    if (field.hasAppearanceStream) parts.push('with appearance stream');
    evidence.push(parts.join(' '));

    // Signed field with appearance stream → highest confidence
    let conf = 0.7;
    if (field.isSigned) conf += 0.2;
    if (field.hasAppearanceStream) conf += 0.1;
    if (conf > maxConfidence) {
      maxConfidence = conf;
      bestBox = field.boundingBox;
    }
  }

  // Signature widgets from page annotations
  const widgetsOnPage = deepParse.signatureWidgets.filter(
    (w) => w.pageNumber === page,
  );
  for (const widget of widgetsOnPage) {
    const parts = [`Sig widget "${widget.fieldName}"`];
    if (widget.isSigned) parts.push('(signed)');
    if (widget.hasAppearanceStream) parts.push('with appearance stream');
    evidence.push(parts.join(' '));

    let conf = 0.65;
    if (widget.isSigned) conf += 0.2;
    if (widget.hasAppearanceStream) conf += 0.1;
    if (conf > maxConfidence) {
      maxConfidence = conf;
      bestBox = widget.boundingBox;
    }
  }

  // Fields with null page that could belong anywhere — weak signal
  const unpagedFields = deepParse.signatureFields.filter(
    (f) => f.pageNumber === null,
  );
  if (unpagedFields.length > 0 && fieldsOnPage.length === 0 && widgetsOnPage.length === 0) {
    evidence.push(`${unpagedFields.length} sig field(s) with unknown page`);
    if (maxConfidence === 0) maxConfidence = 0.15;
  }

  return {
    method: 'structural',
    detected: maxConfidence > 0,
    confidence: Math.min(maxConfidence, 1),
    evidence,
    boundingBox: bestBox,
  };
}
