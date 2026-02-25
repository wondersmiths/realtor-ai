import type {
  Organization,
  Profile,
  Document,
  Listing,
  ComplianceCheck,
  Disclosure,
  Client,
  Signature,
  Subscription,
  OrganizationAIQuota,
  AICostLimit,
  DetectionResult,
  RegressionRun,
  GroundTruthDocument,
  AnomalyFlag,
} from './database';
import type { UserRole } from './enums';

// ──────────────────────────────────────────────
// Organization with the current user's membership
// ──────────────────────────────────────────────
export interface OrganizationWithMembership extends Organization {
  userRole: UserRole;
  membershipId: string;
}

// ──────────────────────────────────────────────
// Document with uploader profile
// ──────────────────────────────────────────────
export interface DocumentWithUploader extends Document {
  uploader: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

// ──────────────────────────────────────────────
// Listing with assigned agent
// ──────────────────────────────────────────────
export interface ListingWithAgent extends Listing {
  agent: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

// ──────────────────────────────────────────────
// Client with assigned agent
// ──────────────────────────────────────────────
export interface ClientWithAgent extends Client {
  agent: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'> | null;
}

// ──────────────────────────────────────────────
// Compliance check with related listing / document
// ──────────────────────────────────────────────
export interface ComplianceCheckWithDetails extends ComplianceCheck {
  listing?: Pick<Listing, 'id' | 'address' | 'mls_number'> | null;
  document?: Pick<Document, 'id' | 'name' | 'file_type'> | null;
  initiated_by_profile?: Pick<Profile, 'id' | 'email' | 'full_name'> | null;
}

// ──────────────────────────────────────────────
// Disclosure with related listing and document
// ──────────────────────────────────────────────
export interface DisclosureWithDetails extends Disclosure {
  listing?: Pick<Listing, 'id' | 'address' | 'mls_number'> | null;
  document?: Pick<Document, 'id' | 'name' | 'file_type'> | null;
}

// ──────────────────────────────────────────────
// Signature with document + signer details
// ──────────────────────────────────────────────
export interface SignatureWithDetails extends Signature {
  document: Pick<Document, 'id' | 'name' | 'file_type'>;
  signer?: Pick<Profile, 'id' | 'email' | 'full_name'> | null;
  client?: Pick<Client, 'id' | 'first_name' | 'last_name' | 'email'> | null;
}

// ──────────────────────────────────────────────
// Subscription with org details
// ──────────────────────────────────────────────
export interface SubscriptionWithOrg extends Subscription {
  organization: Pick<Organization, 'id' | 'name' | 'slug'>;
}

// ──────────────────────────────────────────────
// AI Quota with cost limit info
// ──────────────────────────────────────────────
export interface AIGovernanceSummary {
  quota: OrganizationAIQuota;
  costLimit: AICostLimit;
  currentMonthSpendCents: number;
  isApproachingLimit: boolean;
  isHardLimited: boolean;
}

// ──────────────────────────────────────────────
// Detection result with human review
// ──────────────────────────────────────────────
export interface DetectionResultWithReviewer extends DetectionResult {
  reviewer?: Pick<Profile, 'id' | 'email' | 'full_name'> | null;
}

// ──────────────────────────────────────────────
// Regression run with accuracy delta
// ──────────────────────────────────────────────
export interface RegressionRunWithDelta extends RegressionRun {
  previous_f1?: number | null;
  f1_delta?: number | null;
}

// ──────────────────────────────────────────────
// Ground Truth with creator profile
// ──────────────────────────────────────────────
export interface GroundTruthWithCreator extends GroundTruthDocument {
  creator?: Pick<Profile, 'id' | 'email' | 'full_name'> | null;
}

// ──────────────────────────────────────────────
// Compliance Finding (structured result from a check)
// ──────────────────────────────────────────────
export interface ComplianceFinding {
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  location?: string;
  suggestion?: string;
  rule_id?: string;
}

// ──────────────────────────────────────────────
// Fair Housing Analysis Result
// ──────────────────────────────────────────────
export interface FairHousingViolation {
  text: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
  suggestion: string;
}

export interface FairHousingResult {
  violations: FairHousingViolation[];
  score: number;
  aiUsed: boolean;
}

// ──────────────────────────────────────────────
// Document Classification Result
// ──────────────────────────────────────────────
export interface DocumentClassification {
  documentType: string;
  confidence: number;
  subType: string;
  jurisdiction: string;
  requiredActions: string[];
  summary: string;
}

// ──────────────────────────────────────────────
// Compliance Explanation Result
// ──────────────────────────────────────────────
export interface ComplianceExplanation {
  ruleId: string;
  ruleName: string;
  explanation: string;
  legalBasis: string;
  impact: 'informational' | 'moderate' | 'severe';
  remediation: string;
  examples: string[];
}

// ──────────────────────────────────────────────
// Risk Prediction Results
// ──────────────────────────────────────────────
export interface RiskPattern {
  patternId: string;
  patternName: string;
  riskLevel: string;
  probability: number;
  description: string;
  affectedAreas: string[];
  preventiveActions: string[];
}

export interface RiskPredictionResult {
  overallRiskScore: number;
  patterns: RiskPattern[];
  summary: string;
  timeHorizon: string;
}

// ──────────────────────────────────────────────
// Anomaly Flag with Organization
// ──────────────────────────────────────────────
export interface AnomalyFlagWithOrg extends AnomalyFlag {
  organization?: Pick<Organization, 'id' | 'name' | 'slug'> | null;
}

// ──────────────────────────────────────────────
// Generic AI Result Wrapper
// ──────────────────────────────────────────────
export interface AIResult<T> {
  data: T;
  aiUsed: boolean;
  fallback: boolean;
  model?: string;
  tokensUsed?: number;
  latencyMs?: number;
  cached?: boolean;
  error?: string;
}
