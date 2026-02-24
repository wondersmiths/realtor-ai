import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from './client';

/**
 * Create a rate limiter instance using Upstash Redis.
 * Returns null if Redis is unavailable, enabling graceful degradation.
 */
function createLimiter(
  config: { requests: number; window: `${number} s` | `${number} m` | `${number} h` },
  prefix: string
): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix: `realtorai:ratelimit:${prefix}`,
    analytics: true,
  });
}

/**
 * API rate limiter: 100 requests per 60 seconds per user.
 */
export const apiLimiter = createLimiter({ requests: 100, window: '60 s' }, 'api');

/**
 * AI rate limiter: 20 requests per 60 seconds per organization.
 */
export const aiLimiter = createLimiter({ requests: 20, window: '60 s' }, 'ai');

/**
 * Auth rate limiter: 5 requests per 60 seconds per IP.
 */
export const authLimiter = createLimiter({ requests: 5, window: '60 s' }, 'auth');

/**
 * Upload rate limiter: 10 requests per 60 seconds per user.
 */
export const uploadLimiter = createLimiter({ requests: 10, window: '60 s' }, 'upload');

/**
 * Webhook rate limiter: 100 requests per 10 seconds per IP.
 */
export const webhookLimiter = createLimiter({ requests: 100, window: '10 s' }, 'webhook');

/**
 * Check whether an identifier is within rate limits.
 * If the limiter is null (Redis unavailable), returns success to allow
 * graceful degradation -- the application continues to work without rate limiting.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<{ success: boolean; remaining: number }> {
  if (!limiter) {
    return { success: true, remaining: -1 };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
    };
  } catch (error) {
    console.warn('[RateLimiter] Failed to check rate limit, allowing request:', error);
    return { success: true, remaining: -1 };
  }
}
