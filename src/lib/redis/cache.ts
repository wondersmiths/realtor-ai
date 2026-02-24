import { getRedisClient } from './client';

const KEY_PREFIX = 'realtorai:';

/**
 * CacheService provides a typed caching layer on top of Upstash Redis.
 *
 * All keys are automatically prefixed with `realtorai:` to avoid collisions.
 * Every method degrades gracefully when Redis is unavailable -- reads return null
 * and writes become no-ops so the application keeps working without a cache.
 */
export class CacheService {
  /**
   * Retrieve a cached value by key.
   * Returns null if the key does not exist or Redis is unavailable.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const value = await redis.get<T>(`${KEY_PREFIX}${key}`);
      return value ?? null;
    } catch (error) {
      console.warn('[CacheService] get failed:', error);
      return null;
    }
  }

  /**
   * Store a value under the given key with a TTL in seconds.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      await redis.set(`${KEY_PREFIX}${key}`, value, { ex: ttlSeconds });
    } catch (error) {
      console.warn('[CacheService] set failed:', error);
    }
  }

  /**
   * Delete a cached value by key.
   */
  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      await redis.del(`${KEY_PREFIX}${key}`);
    } catch (error) {
      console.warn('[CacheService] del failed:', error);
    }
  }

  /**
   * Get a cached value or compute and store it if absent.
   *
   * If Redis is unavailable the fetcher is always called (no caching).
   */
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidate all keys matching a glob pattern (e.g. `org:abc:*`).
   *
   * Uses SCAN under the hood so it is safe for large keyspaces.
   * Silently skips when Redis is unavailable.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const fullPattern = `${KEY_PREFIX}${pattern}`;
      let done = false;
      let cur = 0;

      while (!done) {
        // Upstash Redis scan returns [cursor, keys]
        const result = await redis.scan(cur, {
          match: fullPattern,
          count: 100,
        });
        const nextCursor = Number(result[0]);
        const keys = result[1] as string[];
        cur = nextCursor;

        if (keys.length > 0) {
          const pipeline = redis.pipeline();
          for (const key of keys) {
            pipeline.del(key);
          }
          await pipeline.exec();
        }

        if (cur === 0) done = true;
      }
    } catch (error) {
      console.warn('[CacheService] invalidatePattern failed:', error);
    }
  }
}

/**
 * Singleton cache service instance.
 */
export const cacheService = new CacheService();
