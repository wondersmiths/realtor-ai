import type {
  PdfDeepParseResult,
  DetectionHit,
} from '@/types/pdf';

/**
 * Path 1: Structural detection via AcroForm.
 *
 * Inspects the deep-parsed PDF structure for /FT /Sig fields
 * and signature widgets. Returns one DetectionHit per discrete
 * signature field or widget found on the page.
 */
export function detectStructural(
  deepParse: PdfDeepParseResult,
  page: number,
): DetectionHit[] {
  const hits: DetectionHit[] = [];

  // Signature fields from AcroForm /Fields walk
  const fieldsOnPage = deepParse.signatureFields.filter(
    (f) => f.pageNumber === page,
  );
  for (const field of fieldsOnPage) {
    const evidence: string[] = [];
    const parts = [`AcroForm field "${field.fieldName}"`];
    if (field.isSigned) parts.push('(signed)');
    if (field.hasAppearanceStream) parts.push('with appearance stream');
    evidence.push(parts.join(' '));

    if (deepParse.acroForm.hasSigFlags) {
      evidence.push(`AcroForm SigFlags=${deepParse.acroForm.sigFlagsValue}`);
    }

    let conf = 0.7;
    if (field.isSigned) conf += 0.2;
    if (field.hasAppearanceStream) conf += 0.1;

    hits.push({
      method: 'structural',
      confidence: Math.min(conf, 1),
      boundingBox: field.boundingBox,
      evidence,
      fieldName: field.fieldName,
    });
  }

  // Signature widgets from page annotations
  const widgetsOnPage = deepParse.signatureWidgets.filter(
    (w) => w.pageNumber === page,
  );
  for (const widget of widgetsOnPage) {
    const evidence: string[] = [];
    const parts = [`Sig widget "${widget.fieldName}"`];
    if (widget.isSigned) parts.push('(signed)');
    if (widget.hasAppearanceStream) parts.push('with appearance stream');
    evidence.push(parts.join(' '));

    let conf = 0.65;
    if (widget.isSigned) conf += 0.2;
    if (widget.hasAppearanceStream) conf += 0.1;

    hits.push({
      method: 'structural',
      confidence: Math.min(conf, 1),
      boundingBox: widget.boundingBox,
      evidence,
      fieldName: widget.fieldName,
    });
  }

  // Fields with null page — weak signal, only if nothing else found on page
  if (hits.length === 0) {
    const unpagedFields = deepParse.signatureFields.filter(
      (f) => f.pageNumber === null,
    );
    if (unpagedFields.length > 0) {
      hits.push({
        method: 'structural',
        confidence: 0.15,
        boundingBox: null,
        evidence: [`${unpagedFields.length} sig field(s) with unknown page`],
      });
    }
  }

  return hits;
}
