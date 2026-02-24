import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFRef,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFObject,
  PDFStream,
} from 'pdf-lib';

import type {
  PdfBoundingBox,
  PdfSignatureField,
  PdfInkAnnotation,
  PdfAcroFormInfo,
  PdfDeepParseResult,
} from '@/types/pdf';

const PARSER_VERSION = '1.0.0';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Dereference a PDFRef through the document context; pass-through for non-refs. */
function resolve(context: PDFDocument['context'], obj: PDFObject | undefined): PDFObject | undefined {
  if (obj instanceof PDFRef) {
    return context.lookup(obj);
  }
  return obj;
}

/** Convert a PDFName to a plain string (strips the leading '/'). */
function nameToString(name: PDFObject | undefined): string | null {
  if (name instanceof PDFName) {
    return name.decodeText();
  }
  return null;
}

/** Extract string value from PDFString or PDFHexString. */
function pdfStringValue(obj: PDFObject | undefined): string | null {
  if (obj instanceof PDFString) return obj.decodeText();
  if (obj instanceof PDFHexString) return obj.decodeText();
  return null;
}

/** Extract a /Rect array as a PdfBoundingBox. */
function extractRect(
  context: PDFDocument['context'],
  dict: PDFDict,
): PdfBoundingBox | null {
  const rectObj = resolve(context, dict.get(PDFName.of('Rect')));
  if (!(rectObj instanceof PDFArray) || rectObj.size() < 4) return null;

  const nums: number[] = [];
  for (let i = 0; i < 4; i++) {
    const item = resolve(context, rectObj.get(i));
    if (item instanceof PDFNumber) {
      nums.push(item.asNumber());
    } else {
      return null;
    }
  }
  return { x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3] };
}

/** Look up a 1-based page number for a given annotation dict. */
function getPageNumber(
  context: PDFDocument['context'],
  dict: PDFDict,
  pageRefMap: Map<string, number>,
): number | null {
  // Try /P entry (page reference) on the annotation itself
  const pRef = dict.get(PDFName.of('P'));
  if (pRef instanceof PDFRef) {
    const num = pageRefMap.get(pRef.toString());
    if (num !== undefined) return num;
  }
  return null;
}

/** Check whether a dict (or its resolved parent) has /FT /Sig. */
function isSigFieldType(
  context: PDFDocument['context'],
  dict: PDFDict,
): boolean {
  // Direct /FT on the dict
  const ft = resolve(context, dict.get(PDFName.of('FT')));
  if (ft instanceof PDFName && nameToString(ft) === 'Sig') return true;

  // Walk up /Parent chain (widget → field)
  const parent = resolve(context, dict.get(PDFName.of('Parent')));
  if (parent instanceof PDFDict) {
    const parentFt = resolve(context, parent.get(PDFName.of('FT')));
    if (parentFt instanceof PDFName && nameToString(parentFt) === 'Sig') return true;
  }

  return false;
}

/** Extract a PdfSignatureField from a field/widget dict. */
function extractSignatureField(
  context: PDFDocument['context'],
  dict: PDFDict,
  pageRefMap: Map<string, number>,
  objRef: string,
  annotSubtype: string | null,
): PdfSignatureField {
  // Field name: /T on the dict, or on its /Parent
  const tDirect = resolve(context, dict.get(PDFName.of('T')));
  let fieldName = pdfStringValue(tDirect);
  if (!fieldName) {
    const parent = resolve(context, dict.get(PDFName.of('Parent')));
    if (parent instanceof PDFDict) {
      fieldName = pdfStringValue(resolve(context, parent.get(PDFName.of('T'))));
    }
  }

  // Field type
  const ftDirect = resolve(context, dict.get(PDFName.of('FT')));
  let fieldType = nameToString(ftDirect);
  if (!fieldType) {
    const parent = resolve(context, dict.get(PDFName.of('Parent')));
    if (parent instanceof PDFDict) {
      fieldType = nameToString(resolve(context, parent.get(PDFName.of('FT'))));
    }
  }

  // Appearance stream (/AP)
  const ap = resolve(context, dict.get(PDFName.of('AP')));
  const hasAppearanceStream = ap instanceof PDFDict || ap instanceof PDFStream;

  // Signed: /V present and non-null
  let vObj = resolve(context, dict.get(PDFName.of('V')));
  if (vObj === undefined) {
    const parent = resolve(context, dict.get(PDFName.of('Parent')));
    if (parent instanceof PDFDict) {
      vObj = resolve(context, parent.get(PDFName.of('V')));
    }
  }
  const isSigned = vObj !== undefined && !(vObj === null);

  return {
    fieldName: fieldName ?? '<unnamed>',
    fieldType: fieldType ?? 'Unknown',
    pageNumber: getPageNumber(context, dict, pageRefMap),
    boundingBox: extractRect(context, dict),
    hasAppearanceStream,
    isSigned,
    annotationSubtype: annotSubtype,
    objectRef: objRef,
  };
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Deep-parse a PDF buffer and return structured information about
 * signature fields, AcroForm data, ink annotations, and appearance streams.
 */
export async function deepParsePdf(buffer: Buffer): Promise<PdfDeepParseResult> {
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const totalPageCount = pages.length;

  // Build page ref → 1-based page number map
  const pageRefMap = new Map<string, number>();
  for (let i = 0; i < pages.length; i++) {
    const ref = context.getObjectRef(pages[i].node);
    if (ref) {
      pageRefMap.set(ref.toString(), i + 1);
    }
  }

  // ── AcroForm ──────────────────────────────────────────────────────────
  const acroFormDict = pdfDoc.catalog.AcroForm();
  let acroFormInfo: PdfAcroFormInfo;
  const signatureFields: PdfSignatureField[] = [];
  const seenRefs = new Set<string>();

  if (acroFormDict) {
    const fieldsObj = resolve(context, acroFormDict.get(PDFName.of('Fields')));
    const fieldsArray = fieldsObj instanceof PDFArray ? fieldsObj : null;
    const totalFieldCount = fieldsArray ? fieldsArray.size() : 0;

    const sigFlagsObj = resolve(context, acroFormDict.get(PDFName.of('SigFlags')));
    const hasSigFlags = sigFlagsObj instanceof PDFNumber;
    const sigFlagsValue = hasSigFlags ? (sigFlagsObj as PDFNumber).asNumber() : null;

    acroFormInfo = { exists: true, totalFieldCount, hasSigFlags, sigFlagsValue };

    // Walk /Fields to find /FT /Sig fields
    if (fieldsArray) {
      for (let i = 0; i < fieldsArray.size(); i++) {
        const rawRef = fieldsArray.get(i);
        const fieldObj = resolve(context, rawRef);
        if (!(fieldObj instanceof PDFDict)) continue;

        const refStr = rawRef instanceof PDFRef ? rawRef.toString() : `field-${i}`;

        if (isSigFieldType(context, fieldObj)) {
          seenRefs.add(refStr);
          signatureFields.push(
            extractSignatureField(context, fieldObj, pageRefMap, refStr, null),
          );

          // Also walk /Kids (merged field+widget or separate widgets)
          const kidsObj = resolve(context, fieldObj.get(PDFName.of('Kids')));
          if (kidsObj instanceof PDFArray) {
            for (let k = 0; k < kidsObj.size(); k++) {
              const kidRef = kidsObj.get(k);
              const kidObj = resolve(context, kidRef);
              if (!(kidObj instanceof PDFDict)) continue;
              const kidRefStr = kidRef instanceof PDFRef ? kidRef.toString() : `field-${i}-kid-${k}`;
              if (!seenRefs.has(kidRefStr)) {
                seenRefs.add(kidRefStr);
                const subtype = nameToString(resolve(context, kidObj.get(PDFName.of('Subtype'))));
                signatureFields.push(
                  extractSignatureField(context, kidObj, pageRefMap, kidRefStr, subtype),
                );
              }
            }
          }
        }
      }
    }
  } else {
    acroFormInfo = { exists: false, totalFieldCount: 0, hasSigFlags: false, sigFlagsValue: null };
  }

  // ── Walk page annotations ─────────────────────────────────────────────
  const signatureWidgets: PdfSignatureField[] = [];
  const inkAnnotations: PdfInkAnnotation[] = [];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageDict = pages[pageIdx].node;
    const annotsObj = resolve(context, pageDict.get(PDFName.of('Annots')));
    if (!(annotsObj instanceof PDFArray)) continue;

    for (let a = 0; a < annotsObj.size(); a++) {
      const annotRef = annotsObj.get(a);
      const annotObj = resolve(context, annotRef);
      if (!(annotObj instanceof PDFDict)) continue;

      const subtypeName = nameToString(resolve(context, annotObj.get(PDFName.of('Subtype'))));
      const refStr = annotRef instanceof PDFRef ? annotRef.toString() : `page-${pageIdx}-annot-${a}`;

      if (subtypeName === 'Widget' && isSigFieldType(context, annotObj)) {
        if (!seenRefs.has(refStr)) {
          seenRefs.add(refStr);
          signatureWidgets.push(
            extractSignatureField(context, annotObj, pageRefMap, refStr, subtypeName),
          );
        }
      } else if (subtypeName === 'Ink') {
        const ap = resolve(context, annotObj.get(PDFName.of('AP')));
        inkAnnotations.push({
          pageNumber: pageIdx + 1,
          boundingBox: extractRect(context, annotObj),
          hasAppearanceStream: ap instanceof PDFDict || ap instanceof PDFStream,
          objectRef: refStr,
        });
      }
    }
  }

  return {
    pageCount: totalPageCount,
    acroForm: acroFormInfo,
    signatureFields,
    signatureWidgets,
    inkAnnotations,
    signatureFieldCount: signatureFields.length,
    signatureWidgetCount: signatureWidgets.length,
    inkAnnotationCount: inkAnnotations.length,
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
  };
}
