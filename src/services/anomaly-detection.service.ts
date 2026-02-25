import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import { getRedisClient } from '@/lib/redis/client';
import { AuditService } from '@/services/audit.service';
import { NotificationService } from '@/services/notification.service';
import { AuditAction, AnomalyType } from '@/types/enums';

// ────────────────────────────────────────────
// Thresholds (env-configurable)
// ────────────────────────────────────────────

const LARGE_FILE_THRESHOLD_BYTES = parseInt(
  process.env.ANOMALY_LARGE_FILE_BYTES || String(5 * 1024 * 1024),
  10,
);
const LARGE_UPLOAD_LIMIT = parseInt(process.env.ANOMALY_LARGE_UPLOAD_LIMIT || '20', 10);
const DUPLICATE_UPLOAD_LIMIT = parseInt(process.env.ANOMALY_DUPLICATE_UPLOAD_LIMIT || '5', 10);
const AI_SPIKE_ABSOLUTE_LIMIT = parseInt(process.env.ANOMALY_AI_SPIKE_ABSOLUTE || '50', 10);
const AI_SPIKE_RELATIVE_MULTIPLIER = parseFloat(process.env.ANOMALY_AI_SPIKE_MULTIPLIER || '3');
const AI_BASELINE_MIN_CALLS = parseInt(process.env.ANOMALY_AI_BASELINE_MIN || '10', 10);

// TTLs in seconds
const WINDOW_1H = 3600;
const WINDOW_5M = 300;
const COOLDOWN_TTL = 3600;

// Redis key prefixes
const KEY_LARGE_UPLOAD = 'realtorai:anomaly:large_upload';
const KEY_DUP_UPLOAD = 'realtorai:anomaly:dup_upload';
const KEY_AI_SHORT = 'realtorai:anomaly:ai_short';
const KEY_AI_BASELINE = 'realtorai:anomaly:ai_baseline';
const KEY_COOLDOWN = 'realtorai:anomaly:cooldown';

export class AnomalyDetectionService {
  private audit: AuditService;

  constructor(private supabase: SupabaseClient) {
    this.audit = new AuditService(supabase);
  }

  /**
   * Check for upload-related anomalies. Never throws.
   */
  async checkUploadAnomaly(
    orgId: string,
    userId: string,
    fileSize: number,
    fileHash: string,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.checkLargeUploads(orgId, userId, fileSize),
      this.checkDuplicateUploads(orgId, userId, fileHash),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[AnomalyDetection] Upload check failed:', result.reason);
      }
    }
  }

  /**
   * Check for AI usage spike anomalies. Never throws.
   */
  async checkAISpike(orgId: string, userId?: string | null): Promise<void> {
    try {
      await this.detectAISpike(orgId, userId ?? null);
    } catch (err) {
      console.error('[AnomalyDetection] AI spike check failed:', err);
    }
  }

  // ────────────────────────────────────────────
  // Detection: Excessive Large Uploads
  // ────────────────────────────────────────────

  private async checkLargeUploads(
    orgId: string,
    userId: string,
    fileSize: number,
  ): Promise<void> {
    if (fileSize < LARGE_FILE_THRESHOLD_BYTES) return;

    const redis = getRedisClient();
    if (!redis) return;

    const key = `${KEY_LARGE_UPLOAD}:${orgId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_1H);
    }

    if (count >= LARGE_UPLOAD_LIMIT) {
      await this.maybeCreateFlag({
        orgId,
        userId,
        anomalyType: AnomalyType.ExcessiveLargeUploads,
        severity: 'high',
        title: 'Excessive large file uploads detected',
        description: `Organization uploaded ${count} files larger than ${Math.round(LARGE_FILE_THRESHOLD_BYTES / 1024 / 1024)}MB in the last hour.`,
        metadata: { count, thresholdBytes: LARGE_FILE_THRESHOLD_BYTES, windowSeconds: WINDOW_1H },
      });
    }
  }

  // ────────────────────────────────────────────
  // Detection: Repeated Duplicate Uploads
  // ────────────────────────────────────────────

  private async checkDuplicateUploads(
    orgId: string,
    userId: string,
    fileHash: string,
  ): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    const key = `${KEY_DUP_UPLOAD}:${orgId}:${fileHash}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_1H);
    }

    if (count >= DUPLICATE_UPLOAD_LIMIT) {
      await this.maybeCreateFlag({
        orgId,
        userId,
        anomalyType: AnomalyType.RepeatedDuplicateUploads,
        severity: 'medium',
        title: 'Repeated duplicate upload attempts detected',
        description: `Organization attempted to upload the same file ${count} times in the last hour.`,
        metadata: { count, fileHash, windowSeconds: WINDOW_1H },
      });
    }
  }

  // ────────────────────────────────────────────
  // Detection: AI Usage Spike
  // ────────────────────────────────────────────

  private async detectAISpike(orgId: string, userId: string | null): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    // Increment short window (5min)
    const shortKey = `${KEY_AI_SHORT}:${orgId}`;
    const shortCount = await redis.incr(shortKey);
    if (shortCount === 1) {
      await redis.expire(shortKey, WINDOW_5M);
    }

    // Increment baseline window (1hr)
    const baselineKey = `${KEY_AI_BASELINE}:${orgId}`;
    const baselineCount = await redis.incr(baselineKey);
    if (baselineCount === 1) {
      await redis.expire(baselineKey, WINDOW_1H);
    }

    // Absolute spike check
    if (shortCount >= AI_SPIKE_ABSOLUTE_LIMIT) {
      await this.maybeCreateFlag({
        orgId,
        userId: userId ?? undefined,
        anomalyType: AnomalyType.SuddenAISpike,
        severity: 'high',
        title: 'Sudden AI usage spike detected (absolute)',
        description: `Organization made ${shortCount} AI calls in 5 minutes (threshold: ${AI_SPIKE_ABSOLUTE_LIMIT}).`,
        metadata: { shortCount, absoluteLimit: AI_SPIKE_ABSOLUTE_LIMIT, windowSeconds: WINDOW_5M },
      });
      return;
    }

    // Relative spike check: only when baseline has enough data
    if (baselineCount > AI_BASELINE_MIN_CALLS) {
      // Normalized: baseline is over 1hr, short is over 5min. Scale to same window.
      const baselineRatePer5m = (baselineCount / 12); // 1hr = 12 x 5min
      if (shortCount >= baselineRatePer5m * AI_SPIKE_RELATIVE_MULTIPLIER) {
        await this.maybeCreateFlag({
          orgId,
          userId: userId ?? undefined,
          anomalyType: AnomalyType.SuddenAISpike,
          severity: 'medium',
          title: 'Sudden AI usage spike detected (relative)',
          description: `Organization's AI call rate (${shortCount}/5min) is ${AI_SPIKE_RELATIVE_MULTIPLIER}x the baseline rate (${Math.round(baselineRatePer5m)}/5min).`,
          metadata: {
            shortCount,
            baselineCount,
            baselineRatePer5m: Math.round(baselineRatePer5m),
            multiplier: AI_SPIKE_RELATIVE_MULTIPLIER,
          },
        });
      }
    }
  }

  // ────────────────────────────────────────────
  // Flag Creation with Cooldown
  // ────────────────────────────────────────────

  private async maybeCreateFlag(params: {
    orgId: string;
    userId?: string;
    anomalyType: AnomalyType;
    severity: string;
    title: string;
    description: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      // Check cooldown
      const cooldownKey = `${KEY_COOLDOWN}:${params.anomalyType}:${params.orgId}`;
      const existing = await redis.get(cooldownKey);
      if (existing) return;

      // Set cooldown
      await redis.set(cooldownKey, '1', { ex: COOLDOWN_TTL });

      // Insert flag
      const { data: flag, error } = await this.supabase
        .from('anomaly_flags')
        .insert({
          organization_id: params.orgId,
          anomaly_type: params.anomalyType,
          severity: params.severity,
          title: params.title,
          description: params.description,
          metadata: params.metadata,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[AnomalyDetection] Failed to insert anomaly flag:', error.message);
        return;
      }

      const flagId = flag?.id;

      // Structured log
      console.log(JSON.stringify({
        event: 'anomaly_detected',
        flagId,
        orgId: params.orgId,
        anomalyType: params.anomalyType,
        severity: params.severity,
        title: params.title,
      }));

      // Audit log
      await this.audit.log({
        organizationId: params.orgId,
        userId: params.userId || null,
        action: AuditAction.AnomalyDetected,
        resourceType: 'anomaly_flag',
        resourceId: flagId,
        metadata: {
          anomaly_type: params.anomalyType,
          severity: params.severity,
          title: params.title,
          ...params.metadata,
        },
      });

      // Admin email notification (fire-and-forget)
      NotificationService.sendAnomalyAlert(
        params.orgId,
        params.anomalyType,
        params.severity,
        params.title,
        params.description,
        params.metadata,
      ).catch((err) => {
        console.error('[AnomalyDetection] Failed to send alert email:', err);
      });
    } catch (err) {
      console.error('[AnomalyDetection] Failed to create anomaly flag:', err);
    }
  }
}
