import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Shared IORedis connection for all BullMQ queues.
 * maxRetriesPerRequest must be null for BullMQ compatibility.
 */
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

connection.on('error', (err) => {
  console.error('[BullMQ] Redis connection error:', err.message);
});

/**
 * Queue for processing document reviews (text extraction + AI analysis).
 */
export const documentReviewQueue = new Queue('document-review', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Queue for running compliance checks (routing to appropriate check type).
 */
export const complianceCheckQueue = new Queue('compliance-check', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Queue for fair housing language analysis.
 */
export const fairHousingQueue = new Queue('fair-housing', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Queue for sending notifications (email, in-app).
 */
export const notificationQueue = new Queue('notification', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Queue for synchronizing billing / AI usage data with Stripe.
 */
export const billingSyncQueue = new Queue('billing-sync', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export { connection };
