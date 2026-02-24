import type { DetectionHit } from '@/types/pdf';

// ── Keyword categories with weights ────────────────────────────────────────

interface KeywordEntry {
  pattern: RegExp;
  weight: number;
  label: string;
}

const SIGNATURE_KEYWORDS: KeywordEntry[] = [
  { pattern: /\bsign(?:ature)?\s*(?:of|:)/i, weight: 0.30, label: 'signature label' },
  { pattern: /\bsign\s+here\b/i,             weight: 0.35, label: '"sign here"' },
  { pattern: /\bsigned\s+by\b/i,             weight: 0.25, label: '"signed by"' },
  { pattern: /\bsignatory\b/i,               weight: 0.20, label: '"signatory"' },
  { pattern: /\bsigner\b/i,                  weight: 0.20, label: '"signer"' },
  { pattern: /\binitial\s+here\b/i,          weight: 0.25, label: '"initial here"' },
  { pattern: /\binitials?\s*:/i,             weight: 0.15, label: 'initials label' },
  { pattern: /\bwitness\b/i,                 weight: 0.10, label: '"witness"' },
  { pattern: /\bnotary\b/i,                  weight: 0.15, label: '"notary"' },
  { pattern: /\backnowledg(?:e|ment)\b/i,    weight: 0.10, label: '"acknowledgment"' },
  { pattern: /\bexecut(?:e|ed|ion)\b/i,      weight: 0.10, label: '"executed"' },
];

/** Patterns indicating a signature line (underscores, X-marks). */
const LINE_PATTERNS: KeywordEntry[] = [
  { pattern: /_{5,}/,                       weight: 0.20, label: 'underscore line' },
  { pattern: /x\s*_{3,}/i,                  weight: 0.30, label: 'X-mark signature line' },
  { pattern: /\bx\s*:\s*_{3,}/i,            weight: 0.30, label: 'X: signature line' },
];

/** Proximity keywords that boost confidence when near a signature keyword. */
const PROXIMITY_BOOSTERS: KeywordEntry[] = [
  { pattern: /\bdate\s*:/i,    weight: 0.10, label: '"date:"' },
  { pattern: /\bprint\s+name/i, weight: 0.10, label: '"print name"' },
  { pattern: /\btitle\s*:/i,   weight: 0.05, label: '"title:"' },
  { pattern: /\bname\s*:/i,    weight: 0.05, label: '"name:"' },
];

/**
 * Number of lines above/below a signature keyword to search
 * for proximity boosters.
 */
const PROXIMITY_WINDOW = 3;

// ── Helpers ────────────────────────────────────────────────────────────────

function findProximityBoost(
  lines: string[],
  anchorIdx: number,
): { boost: number; evidence: string[] } {
  let boost = 0;
  const evidence: string[] = [];
  const start = Math.max(0, anchorIdx - PROXIMITY_WINDOW);
  const end = Math.min(lines.length - 1, anchorIdx + PROXIMITY_WINDOW);

  for (let i = start; i <= end; i++) {
    for (const entry of PROXIMITY_BOOSTERS) {
      if (entry.pattern.test(lines[i])) {
        boost += entry.weight;
        evidence.push(`${entry.label} nearby (line ${i + 1})`);
      }
    }
  }

  return { boost, evidence };
}

/**
 * Path 3: Keyword + layout proximity detection.
 *
 * Returns a single aggregate DetectionHit per page (no bounding box)
 * summarizing all keyword / line-pattern evidence found.
 */
export function detectKeyword(
  pageText: string,
  _page: number,
): DetectionHit[] {
  if (!pageText.trim()) return [];

  const lines = pageText.split('\n');
  const evidence: string[] = [];
  let totalScore = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    for (const entry of SIGNATURE_KEYWORDS) {
      if (entry.pattern.test(line)) {
        evidence.push(`${entry.label} (line ${lineIdx + 1})`);
        totalScore += entry.weight;

        const prox = findProximityBoost(lines, lineIdx);
        totalScore += prox.boost;
        evidence.push(...prox.evidence);
        break; // one keyword match per line
      }
    }

    for (const entry of LINE_PATTERNS) {
      if (entry.pattern.test(line)) {
        evidence.push(`${entry.label} (line ${lineIdx + 1})`);
        totalScore += entry.weight;
        break;
      }
    }
  }

  if (totalScore < 0.20 || evidence.length === 0) return [];

  return [{
    method: 'keyword',
    confidence: Math.min(totalScore, 1),
    boundingBox: null,
    evidence,
  }];
}
