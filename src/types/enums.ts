// ──────────────────────────────────────────────
// User Roles
// ──────────────────────────────────────────────
export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Agent = 'agent',
}

// ──────────────────────────────────────────────
// Document Status
// ──────────────────────────────────────────────
export enum DocumentStatus {
  Pending = 'pending',
  Reviewing = 'reviewing',
  Reviewed = 'reviewed',
  Flagged = 'flagged',
  Approved = 'approved',
}

// ──────────────────────────────────────────────
// Compliance Check Type
// ──────────────────────────────────────────────
export enum ComplianceCheckType {
  FairHousing = 'fair_housing',
  ListingCompliance = 'listing_compliance',
  DocumentReview = 'document_review',
  DisclosureCompleteness = 'disclosure_completeness',
}

// ──────────────────────────────────────────────
// Compliance Check Status
// ──────────────────────────────────────────────
export enum ComplianceCheckStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

// ──────────────────────────────────────────────
// Disclosure Type
// ──────────────────────────────────────────────
export enum DisclosureType {
  SellerDisclosure = 'seller_disclosure',
  LeadPaint = 'lead_paint',
  PropertyCondition = 'property_condition',
  NaturalHazard = 'natural_hazard',
  HOA = 'hoa',
  Title = 'title',
  FloodZone = 'flood_zone',
}

// ──────────────────────────────────────────────
// Disclosure Status
// ──────────────────────────────────────────────
export enum DisclosureStatus {
  Required = 'required',
  InProgress = 'in_progress',
  Submitted = 'submitted',
  Reviewed = 'reviewed',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

// ──────────────────────────────────────────────
// Plan Tier
// ──────────────────────────────────────────────
export enum PlanTier {
  Free = 'free',
  Solo = 'solo',
  Pro = 'pro',
  Team = 'team',
}

// ──────────────────────────────────────────────
// Client Type
// ──────────────────────────────────────────────
export enum ClientType {
  Buyer = 'buyer',
  Seller = 'seller',
  Both = 'both',
}

// ──────────────────────────────────────────────
// Signature Status
// ──────────────────────────────────────────────
export enum SignatureStatus {
  Pending = 'pending',
  Sent = 'sent',
  Viewed = 'viewed',
  Signed = 'signed',
  Declined = 'declined',
  Expired = 'expired',
}

// ──────────────────────────────────────────────
// Reminder Channel
// ──────────────────────────────────────────────
export enum ReminderChannel {
  InApp = 'in_app',
  Email = 'email',
  Both = 'both',
}

// ──────────────────────────────────────────────
// Subscription Status
// ──────────────────────────────────────────────
export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Canceled = 'canceled',
  Trialing = 'trialing',
  Incomplete = 'incomplete',
  Paused = 'paused',
}

// ──────────────────────────────────────────────
// Listing Status
// ──────────────────────────────────────────────
export enum ListingStatus {
  Draft = 'draft',
  Active = 'active',
  Pending = 'pending',
  Sold = 'sold',
  Withdrawn = 'withdrawn',
  Expired = 'expired',
}

// ──────────────────────────────────────────────
// AI Usage Status
// ──────────────────────────────────────────────
export enum AIUsageStatus {
  Success = 'success',
  Error = 'error',
  Timeout = 'timeout',
  Fallback = 'fallback',
}

// ──────────────────────────────────────────────
// Detection Error Type
// ──────────────────────────────────────────────
export enum DetectionErrorType {
  FalsePositive = 'false_positive',
  FalseNegative = 'false_negative',
  MissedSignature = 'missed_signature',
  Misclassification = 'misclassification',
}

// ──────────────────────────────────────────────
// Severity
// ──────────────────────────────────────────────
export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

// ──────────────────────────────────────────────
// Ground Truth Source
// ──────────────────────────────────────────────
export enum GroundTruthSource {
  Manual = 'manual',
  ProductionReview = 'production_review',
  Synthetic = 'synthetic',
}

// ──────────────────────────────────────────────
// Regression Run Status
// ──────────────────────────────────────────────
export enum RegressionRunStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Canceled = 'canceled',
}

// ──────────────────────────────────────────────
// Regression Run Trigger
// ──────────────────────────────────────────────
export enum RegressionTrigger {
  Manual = 'manual',
  CI = 'ci',
  Scheduled = 'scheduled',
  Deploy = 'deploy',
}

// ──────────────────────────────────────────────
// Resource Type (for reminders / audit)
// ──────────────────────────────────────────────
export enum ResourceType {
  Disclosure = 'disclosure',
  Document = 'document',
  Listing = 'listing',
  Signature = 'signature',
  ComplianceCheck = 'compliance_check',
}

// ──────────────────────────────────────────────
// Audit Action
// ──────────────────────────────────────────────
export enum AuditAction {
  // Auth
  UserSignUp = 'user.sign_up',
  UserSignIn = 'user.sign_in',
  UserSignOut = 'user.sign_out',

  // Organization
  OrgCreated = 'org.created',
  OrgUpdated = 'org.updated',
  OrgDeleted = 'org.deleted',
  MemberInvited = 'org.member_invited',
  MemberRemoved = 'org.member_removed',
  MemberRoleChanged = 'org.member_role_changed',

  // Document
  DocumentUploaded = 'document.uploaded',
  DocumentUpdated = 'document.updated',
  DocumentDeleted = 'document.deleted',
  DocumentReviewed = 'document.reviewed',

  // Listing
  ListingCreated = 'listing.created',
  ListingUpdated = 'listing.updated',
  ListingDeleted = 'listing.deleted',

  // Compliance
  ComplianceCheckStarted = 'compliance.check_started',
  ComplianceCheckCompleted = 'compliance.check_completed',
  ComplianceCheckFailed = 'compliance.check_failed',

  // Disclosure
  DisclosureCreated = 'disclosure.created',
  DisclosureUpdated = 'disclosure.updated',
  DisclosureStatusChanged = 'disclosure.status_changed',

  // Fair Housing
  FairHousingCheckRun = 'fair_housing.check_run',

  // Client
  ClientCreated = 'client.created',
  ClientUpdated = 'client.updated',
  ClientDeleted = 'client.deleted',

  // Signature
  SignatureRequested = 'signature.requested',
  SignatureSigned = 'signature.signed',
  SignatureDeclined = 'signature.declined',

  // AI Governance
  AIQuotaUpdated = 'ai.quota_updated',
  AICostLimitUpdated = 'ai.cost_limit_updated',
  AICostLimitReached = 'ai.cost_limit_reached',
  AISystemCeilingBreached = 'ai.system_ceiling_breached',

  // Billing
  SubscriptionCreated = 'billing.subscription_created',
  SubscriptionUpdated = 'billing.subscription_updated',
  SubscriptionCancelled = 'billing.subscription_cancelled',
  PaymentSucceeded = 'billing.payment_succeeded',
  PaymentFailed = 'billing.payment_failed',
}
