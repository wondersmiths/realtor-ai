import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';

import {
  MLS_FILE_SIZE_THRESHOLD,
  PDF_SPLIT_MAX_PAGES_PER_PART,
} from '@/lib/constants';

import type {
  PdfMetadataInfo,
  PdfOptimizationAnalysis,
  PdfOptimizationRecommendation,
  PdfCompressionResult,
  PdfSplitPart,
  PdfSplitResult,
  PdfOptimizationResult,
  PdfOptimizationOptions,
} from '@/types/pdf';

const OPTIMIZER_VERSION = '1.0.0';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Keys in the PDF Info dictionary that we strip during compression. */
const INFO_KEYS_TO_STRIP = [
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
] as const;

/** Safely read a string value from the Info dictionary. */
function readInfoString(infoDict: PDFDict | undefined, key: string): string | null {
  if (!infoDict) return null;
  try {
    const val = infoDict.get(PDFName.of(key));
    if (!val) return null;
    return String(val);
  } catch {
    return null;
  }
}

/** Extract metadata from a loaded PDF document. */
function extractMetadata(pdfDoc: PDFDocument, bufferSize: number): PdfMetadataInfo {
  const trailer = pdfDoc.context.trailerInfo;
  const infoRef = trailer.Info;
  const infoDict = infoRef ? (pdfDoc.context.lookup(infoRef) as PDFDict | undefined) : undefined;
  const info = infoDict instanceof PDFDict ? infoDict : undefined;

  return {
    title: readInfoString(info, 'Title'),
    author: readInfoString(info, 'Author'),
    subject: readInfoString(info, 'Subject'),
    keywords: readInfoString(info, 'Keywords'),
    creator: readInfoString(info, 'Creator'),
    producer: readInfoString(info, 'Producer'),
    creationDate: readInfoString(info, 'CreationDate'),
    modificationDate: readInfoString(info, 'ModDate'),
    estimatedSizeBytes: bufferSize,
  };
}

/** Check if a PDF is encrypted by looking for the /Encrypt trailer entry. */
function checkEncrypted(pdfDoc: PDFDocument): boolean {
  try {
    const encrypt = pdfDoc.context.trailerInfo.Encrypt;
    return encrypt !== undefined;
  } catch {
    return false;
  }
}

// ── analyze ────────────────────────────────────────────────────────────────

/**
 * Analyze a PDF buffer against an MLS size threshold and return a recommendation.
 */
export async function analyzePdf(
  buffer: Buffer,
  options?: Pick<PdfOptimizationOptions, 'thresholdBytes'>,
): Promise<PdfOptimizationAnalysis> {
  const thresholdBytes = options?.thresholdBytes ?? MLS_FILE_SIZE_THRESHOLD;
  const originalSizeBytes = buffer.length;

  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const pageCount = pdfDoc.getPageCount();
  const isEncrypted = checkEncrypted(pdfDoc);
  const metadata = extractMetadata(pdfDoc, originalSizeBytes);
  const exceedsThreshold = originalSizeBytes > thresholdBytes;

  let recommendation: PdfOptimizationRecommendation;
  let reason: string;

  if (isEncrypted) {
    recommendation = 'none';
    reason = 'PDF is encrypted; optimization skipped to preserve document integrity.';
  } else if (!exceedsThreshold) {
    recommendation = 'none';
    reason = `File size (${originalSizeBytes} bytes) is within the ${thresholdBytes}-byte threshold.`;
  } else if (pageCount <= 1) {
    recommendation = 'compress';
    reason = 'Single-page PDF exceeds threshold; compression will be attempted but splitting is not possible.';
  } else {
    recommendation = 'compress_and_split';
    reason = `Multi-page PDF (${pageCount} pages, ${originalSizeBytes} bytes) exceeds the ${thresholdBytes}-byte threshold.`;
  }

  return {
    originalSizeBytes,
    pageCount,
    isEncrypted,
    metadata,
    thresholdBytes,
    exceedsThreshold,
    recommendation,
    reason,
  };
}

// ── compress ───────────────────────────────────────────────────────────────

/**
 * Compress a PDF by stripping non-essential metadata and re-saving with object streams.
 */
export async function compressPdf(
  buffer: Buffer,
  options?: Pick<PdfOptimizationOptions, 'thresholdBytes'>,
): Promise<PdfCompressionResult> {
  const thresholdBytes = options?.thresholdBytes ?? MLS_FILE_SIZE_THRESHOLD;
  const originalSizeBytes = buffer.length;

  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // Strip Info dictionary metadata keys
  let strippedMetadata = false;
  const trailer = pdfDoc.context.trailerInfo;
  const infoRef = trailer.Info;
  if (infoRef) {
    const infoDict = pdfDoc.context.lookup(infoRef);
    if (infoDict instanceof PDFDict) {
      for (const key of INFO_KEYS_TO_STRIP) {
        try {
          infoDict.delete(PDFName.of(key));
          strippedMetadata = true;
        } catch {
          // Key may not exist — that's fine
        }
      }
    }
  }

  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 50,
    updateFieldAppearances: false,
  });

  const compressedBuffer = Buffer.from(compressedBytes);
  const compressedSizeBytes = compressedBuffer.length;
  const compressionRatio =
    originalSizeBytes > 0
      ? (originalSizeBytes - compressedSizeBytes) / originalSizeBytes
      : 0;

  return {
    buffer: compressedBuffer,
    originalSizeBytes,
    compressedSizeBytes,
    compressionRatio,
    usedObjectStreams: true,
    strippedMetadata,
    meetsThreshold: compressedSizeBytes <= thresholdBytes,
  };
}

// ── split ──────────────────────────────────────────────────────────────────

/**
 * Split a PDF into multiple parts, either at user-specified page boundaries
 * or automatically based on a size threshold.
 */
export async function splitPdf(
  buffer: Buffer,
  options?: Pick<PdfOptimizationOptions, 'thresholdBytes' | 'splitAtPages' | 'maxPagesPerPart'>,
): Promise<PdfSplitResult> {
  const thresholdBytes = options?.thresholdBytes ?? MLS_FILE_SIZE_THRESHOLD;
  const maxPagesPerPart = options?.maxPagesPerPart ?? PDF_SPLIT_MAX_PAGES_PER_PART;
  const originalSizeBytes = buffer.length;

  const srcDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= 1) {
    // Cannot split a single-page PDF
    return {
      parts: [{
        buffer,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        sizeBytes: originalSizeBytes,
        label: 'Part 1 of 1 (page 1)',
      }],
      totalParts: 1,
      originalPageCount: totalPages,
      originalSizeBytes,
      allPartsUnderThreshold: originalSizeBytes <= thresholdBytes,
      splitMode: options?.splitAtPages ? 'user-specified' : 'auto',
    };
  }

  // Build page ranges
  let ranges: Array<{ start: number; end: number }>;
  let splitMode: 'auto' | 'user-specified';

  if (options?.splitAtPages && options.splitAtPages.length > 0) {
    // User-specified split points
    splitMode = 'user-specified';
    ranges = buildUserSpecifiedRanges(options.splitAtPages, totalPages);
  } else {
    // Auto split — estimate pages per part and refine
    splitMode = 'auto';
    ranges = await buildAutoRanges(buffer, totalPages, thresholdBytes, maxPagesPerPart);
  }

  // Build parts from ranges
  const parts: PdfSplitPart[] = [];
  const totalParts = ranges.length;

  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    const partDoc = await PDFDocument.create();
    // pdf-lib uses 0-based page indices
    const pageIndices = Array.from({ length: end - start + 1 }, (_, idx) => start - 1 + idx);
    const copiedPages = await partDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      partDoc.addPage(page);
    }

    const partBytes = await partDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
      updateFieldAppearances: false,
    });

    const partBuffer = Buffer.from(partBytes);
    parts.push({
      buffer: partBuffer,
      startPage: start,
      endPage: end,
      pageCount: end - start + 1,
      sizeBytes: partBuffer.length,
      label: `Part ${i + 1} of ${totalParts} (pages ${start}-${end})`,
    });
  }

  const allPartsUnderThreshold = parts.every((p) => p.sizeBytes <= thresholdBytes);

  return {
    parts,
    totalParts,
    originalPageCount: totalPages,
    originalSizeBytes,
    allPartsUnderThreshold,
    splitMode,
  };
}

/** Build page ranges from user-specified split boundaries. */
function buildUserSpecifiedRanges(
  splitAtPages: number[],
  totalPages: number,
): Array<{ start: number; end: number }> {
  // Validate, clamp, sort, and deduplicate
  const validPoints = Array.from(new Set(
    splitAtPages
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)
      .sort((a, b) => a - b),
  ));

  // Remove totalPages itself if present (it would create an empty final range)
  const boundaries = validPoints.filter((p) => p < totalPages);

  if (boundaries.length === 0) {
    // No valid split points — return entire document as one part
    return [{ start: 1, end: totalPages }];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart = 1;

  for (const boundary of boundaries) {
    ranges.push({ start: rangeStart, end: boundary });
    rangeStart = boundary + 1;
  }

  // Final range: from after last boundary to end
  if (rangeStart <= totalPages) {
    ranges.push({ start: rangeStart, end: totalPages });
  }

  return ranges;
}

/** Build page ranges using auto-estimation with halving retry. */
async function buildAutoRanges(
  buffer: Buffer,
  totalPages: number,
  thresholdBytes: number,
  maxPagesPerPart: number,
): Promise<Array<{ start: number; end: number }>> {
  const fileSize = buffer.length;
  const avgBytesPerPage = fileSize / totalPages;

  // Estimate pages per part that would fit under threshold
  let pagesPerPart = Math.max(1, Math.min(
    maxPagesPerPart,
    Math.floor(thresholdBytes / avgBytesPerPage),
  ));

  // Try building parts; if any exceeds threshold, halve and retry
  // Stop retrying once pagesPerPart reaches 1
  const srcDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const ranges = buildEvenRanges(totalPages, pagesPerPart);
    let allFit = true;

    for (const { start, end } of ranges) {
      const partDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: end - start + 1 }, (_, idx) => start - 1 + idx);
      const copiedPages = await partDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        partDoc.addPage(page);
      }

      const partBytes = await partDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
        updateFieldAppearances: false,
      });

      if (partBytes.length > thresholdBytes) {
        allFit = false;
        break;
      }
    }

    if (allFit || pagesPerPart <= 1) {
      return ranges;
    }

    // Halve and retry
    pagesPerPart = Math.max(1, Math.floor(pagesPerPart / 2));
  }

  // Fallback: 1 page per part
  return buildEvenRanges(totalPages, 1);
}

/** Build evenly-sized page ranges given a pages-per-part target. */
function buildEvenRanges(
  totalPages: number,
  pagesPerPart: number,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 1;
  while (start <= totalPages) {
    const end = Math.min(start + pagesPerPart - 1, totalPages);
    ranges.push({ start, end });
    start = end + 1;
  }
  return ranges;
}

// ── optimizePdf (orchestrator) ─────────────────────────────────────────────

/**
 * Full optimization pipeline: analyze → compress → split (if needed).
 *
 * Returns a typed result with Buffers for the worker to consume.
 */
export async function optimizePdf(
  buffer: Buffer,
  options?: PdfOptimizationOptions,
): Promise<PdfOptimizationResult> {
  const timestamp = new Date().toISOString();

  // 1. Analyze
  const analysis = await analyzePdf(buffer, options);

  // Early return: no action needed
  if (analysis.recommendation === 'none' || options?.analyzeOnly) {
    return {
      analysis,
      compression: null,
      split: null,
      optimizedBuffer: buffer,
      finalSizeBytes: buffer.length,
      meetsThreshold: !analysis.exceedsThreshold,
      actionTaken: 'none',
      version: OPTIMIZER_VERSION,
      timestamp,
    };
  }

  // 2. Compress
  const compression = await compressPdf(buffer, options);
  const workingBuffer = compression.buffer;
  let actionTaken: PdfOptimizationRecommendation = 'compress';

  // 3. Split if still over threshold and splitting is applicable
  let split: PdfSplitResult | null = null;

  const shouldSplit =
    !options?.skipSplit &&
    analysis.pageCount > 1 &&
    (!compression.meetsThreshold || (options?.splitAtPages && options.splitAtPages.length > 0));

  if (shouldSplit) {
    split = await splitPdf(workingBuffer, options);
    actionTaken = 'compress_and_split';
  }

  const finalSizeBytes = workingBuffer.length;
  const meetsThreshold = split
    ? split.allPartsUnderThreshold
    : compression.meetsThreshold;

  return {
    analysis,
    compression,
    split,
    optimizedBuffer: workingBuffer,
    finalSizeBytes,
    meetsThreshold,
    actionTaken,
    version: OPTIMIZER_VERSION,
    timestamp,
  };
}
