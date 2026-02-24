/**
 * Main worker entrypoint.
 *
 * Starts BullMQ Worker instances for all queues and listens for jobs.
 * Run via: npm run worker
 *
 * Handles SIGTERM/SIGINT for graceful shutdown -- each worker is closed
 * allowing in-flight jobs to complete before the process exits.
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';

// Processors
import { processDocumentReview } from './src/workers/document-review.worker';
import { processComplianceCheck } from './src/workers/compliance-check.worker';
import { processFairHousingCheck } from './src/workers/fair-housing.worker';
import { processNotification } from './src/workers/notification.worker';
import { processBillingSync } from './src/workers/billing-sync.worker';

// ──────────────────────────────────────────────
// Redis connection
// ──────────────────────────────────────────────

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

connection.on('error', (err) => {
  console.error('[Worker] Redis connection error:', err.message);
});

connection.on('connect', () => {
  console.log('[Worker] Connected to Redis');
});

// ──────────────────────────────────────────────
// Worker instances
// ──────────────────────────────────────────────

const workers: Worker[] = [];

const documentReviewWorker = new Worker('document-review', processDocumentReview, {
  connection,
  concurrency: 3,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});
workers.push(documentReviewWorker);

const complianceCheckWorker = new Worker('compliance-check', processComplianceCheck, {
  connection,
  concurrency: 5,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});
workers.push(complianceCheckWorker);

const fairHousingWorker = new Worker('fair-housing', processFairHousingCheck, {
  connection,
  concurrency: 5,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});
workers.push(fairHousingWorker);

const notificationWorker = new Worker('notification', processNotification, {
  connection,
  concurrency: 10,
  removeOnComplete: { count: 5000 },
  removeOnFail: { count: 5000 },
});
workers.push(notificationWorker);

const billingSyncWorker = new Worker('billing-sync', processBillingSync, {
  connection,
  concurrency: 2,
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
});
workers.push(billingSyncWorker);

// ──────────────────────────────────────────────
// Event logging
// ──────────────────────────────────────────────

for (const worker of workers) {
  worker.on('completed', (job) => {
    console.log(`[Worker:${worker.name}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${worker.name}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[Worker:${worker.name}] Error:`, err.message);
  });
}

console.log('[Worker] All workers started:');
console.log('  - document-review (concurrency: 3)');
console.log('  - compliance-check (concurrency: 5)');
console.log('  - fair-housing (concurrency: 5)');
console.log('  - notification (concurrency: 10)');
console.log('  - billing-sync (concurrency: 2)');

// ──────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}. Shutting down gracefully...`);

  try {
    // Close all workers (waits for in-flight jobs to finish)
    await Promise.all(workers.map((w) => w.close()));
    console.log('[Worker] All workers closed');

    // Close Redis connection
    await connection.quit();
    console.log('[Worker] Redis connection closed');

    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
