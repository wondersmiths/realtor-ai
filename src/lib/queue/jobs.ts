// ──────────────────────────────────────────────
// Job payload interfaces for all BullMQ queues
// ──────────────────────────────────────────────

/**
 * Payload for the document-review queue.
 * Triggers text extraction and AI-powered compliance review of a document.
 */
export interface DocumentReviewJob {
  documentId: string;
  orgId: string;
  userId: string;
  filePath: string;
}

/**
 * Payload for the compliance-check queue.
 * Routes to the appropriate check handler based on `checkType`.
 */
export interface ComplianceCheckJob {
  checkId: string;
  orgId: string;
  userId: string;
  checkType: 'fair_housing' | 'listing_compliance' | 'document_review' | 'disclosure_completeness';
  listingId?: string;
  documentId?: string;
}

/**
 * Payload for the fair-housing queue.
 * Runs both rule-based and AI-enhanced fair housing analysis.
 */
export interface FairHousingJob {
  checkId: string;
  orgId: string;
  userId: string;
  text: string;
  context?: string;
}

/**
 * Payload for the notification queue.
 * Routes to the appropriate notification channel and template.
 */
export interface NotificationJob {
  type: 'compliance_alert' | 'disclosure_reminder' | 'invitation';
  orgId: string;
  recipientEmail: string;
  data: Record<string, unknown>;
}

/**
 * Payload for the billing-sync queue.
 * Aggregates AI usage for a billing period and optionally syncs with Stripe.
 */
export interface BillingSyncJob {
  orgId: string;
  period: string; // ISO date string representing the billing period, e.g. "2026-02"
}
