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

// ──────────────────────────────────────────────
// Document Classification
// ──────────────────────────────────────────────

export const documentClassificationSchema = z.object({
  documentType: z.string(),
  confidence: z.number().min(0).max(100),
  subType: z.string(),
  jurisdiction: z.string(),
  requiredActions: z.array(z.string()),
  summary: z.string(),
});

export type DocumentClassificationResponse = z.infer<typeof documentClassificationSchema>;

// ──────────────────────────────────────────────
// Compliance Explanation
// ──────────────────────────────────────────────

export const complianceExplanationSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  explanation: z.string(),
  legalBasis: z.string(),
  impact: z.enum(['informational', 'moderate', 'severe']),
  remediation: z.string(),
  examples: z.array(z.string()),
});

export type ComplianceExplanationResponse = z.infer<typeof complianceExplanationSchema>;

// ──────────────────────────────────────────────
// Risk Prediction
// ──────────────────────────────────────────────

export const riskPatternSchema = z.object({
  patternId: z.string(),
  patternName: z.string(),
  riskLevel: z.string(),
  probability: z.number().min(0).max(100),
  description: z.string(),
  affectedAreas: z.array(z.string()),
  preventiveActions: z.array(z.string()),
});

export const riskPredictionResultSchema = z.object({
  overallRiskScore: z.number().min(0).max(100),
  patterns: z.array(riskPatternSchema),
  summary: z.string(),
  timeHorizon: z.string(),
});

export type RiskPredictionResultResponse = z.infer<typeof riskPredictionResultSchema>;
