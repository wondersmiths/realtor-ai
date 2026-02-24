import { z } from 'zod';

// ──────────────────────────────────────────────
// Document Review
// ──────────────────────────────────────────────

export const documentReviewSchema = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      message: z.string(),
      location: z.string().optional(),
      suggestion: z.string().optional(),
      rule_id: z.string().optional(),
    })
  ),
  summary: z.string(),
});

export type DocumentReviewResponse = z.infer<typeof documentReviewSchema>;

// ──────────────────────────────────────────────
// Fair Housing
// ──────────────────────────────────────────────

export const fairHousingSchema = z.object({
  violations: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      explanation: z.string(),
      suggestion: z.string(),
    })
  ),
  score: z.number().min(0).max(100),
  summary: z.string().optional(),
});

export type FairHousingResponse = z.infer<typeof fairHousingSchema>;

// ──────────────────────────────────────────────
// Listing Compliance
// ──────────────────────────────────────────────

export const listingComplianceSchema = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      message: z.string(),
      location: z.string().optional(),
      suggestion: z.string().optional(),
    })
  ),
  recommendations: z.array(z.string()),
});

export type ListingComplianceResponse = z.infer<typeof listingComplianceSchema>;

// ──────────────────────────────────────────────
// Compliance Summary
// ──────────────────────────────────────────────

export const complianceSummarySchema = z.object({
  overallScore: z.number().min(0).max(100),
  areas: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(100),
      status: z.enum(['pass', 'warning', 'fail']),
      issueCount: z.number(),
      topIssue: z.string().nullable(),
    })
  ),
  recommendations: z.array(z.string()),
});

export type ComplianceSummaryResponse = z.infer<typeof complianceSummarySchema>;
