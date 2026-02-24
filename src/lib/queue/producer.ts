import {
  documentReviewQueue,
  complianceCheckQueue,
  fairHousingQueue,
  notificationQueue,
  billingSyncQueue,
} from './client';
import type {
  DocumentReviewJob,
  ComplianceCheckJob,
  FairHousingJob,
  NotificationJob,
  BillingSyncJob,
} from './jobs';

/**
 * Standard job options: 3 retries with exponential backoff.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // 2s, then 4s, then 8s
  },
};

/**
 * Enqueue a document review job.
 * The worker will download the file, extract text, run AI review, and save results.
 */
export async function enqueueDocumentReview(data: DocumentReviewJob): Promise<string> {
  const job = await documentReviewQueue.add(
    'review',
    data,
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `doc-review:${data.documentId}`,
    }
  );
  return job.id ?? data.documentId;
}

/**
 * Enqueue a compliance check job.
 * The worker will route to the appropriate check type handler.
 */
export async function enqueueComplianceCheck(data: ComplianceCheckJob): Promise<string> {
  const job = await complianceCheckQueue.add(
    'check',
    data,
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `compliance-check:${data.checkId}`,
    }
  );
  return job.id ?? data.checkId;
}

/**
 * Enqueue a fair housing analysis job.
 * The worker will run both rule-based and AI-enhanced checks, then merge findings.
 */
export async function enqueueFairHousingCheck(data: FairHousingJob): Promise<string> {
  const job = await fairHousingQueue.add(
    'validate',
    data,
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `fair-housing:${data.checkId}`,
    }
  );
  return job.id ?? data.checkId;
}

/**
 * Enqueue a notification job.
 * The worker will route by notification type and send via Resend.
 */
export async function enqueueNotification(data: NotificationJob): Promise<string> {
  const job = await notificationQueue.add(
    'send',
    data,
    {
      ...DEFAULT_JOB_OPTIONS,
    }
  );
  return job.id ?? 'notification';
}

/**
 * Enqueue a billing sync job.
 * The worker will aggregate AI usage and sync metered billing with Stripe.
 */
export async function enqueueBillingSync(data: BillingSyncJob): Promise<string> {
  const job = await billingSyncQueue.add(
    'sync',
    data,
    {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `billing-sync:${data.orgId}:${data.period}`,
    }
  );
  return job.id ?? `${data.orgId}:${data.period}`;
}
