import "server-only";

import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

type DashboardCacheScope = "api" | "billing" | "history";

export function dashboardCacheKey(userId: string, part: string): string {
  const namespace = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "local";
  return `voxtts:${namespace}:dashboard:${userId}:${part}`;
}

export async function cachedDashboardValue<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedisClient();
  if (!redis) return cachedMemoryValue(key, ttlSeconds, loader);

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    await redis.set(key, value, { ex: ttlSeconds });
    return value;
  } catch (error) {
    console.warn("[dashboard-cache] Redis unavailable, using local cache fallback.", error);
    return cachedMemoryValue(key, ttlSeconds, loader);
  }
}

export async function invalidateDashboardCountCache(
  userId: string,
  scopes: DashboardCacheScope[] = ["api", "billing", "history"],
): Promise<void> {
  const keys = new Set<string>();
  if (scopes.includes("api")) {
    keys.add(dashboardCacheKey(userId, "api:usage"));
    keys.add(dashboardCacheKey(userId, "api:data"));
  }
  if (scopes.includes("billing")) {
    keys.add(dashboardCacheKey(userId, "billing:credits-earned"));
  }
  if (scopes.includes("history")) {
    for (const mode of ["all", "tts", "clone"]) {
      keys.add(dashboardCacheKey(userId, `history:${mode}:stats`));
      keys.add(dashboardCacheKey(userId, `history:${mode}:count:all`));
    }
  }

  if (keys.size === 0) return;
  for (const key of keys) memoryCache.delete(key);

  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(...Array.from(keys));
  } catch (error) {
    console.warn("[dashboard-cache] Could not invalidate Redis dashboard counts.", error);
  }
}

async function cachedMemoryValue<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  if (memoryCache.size > 300) {
    const expiredKeys = Array.from(memoryCache.entries())
      .filter(([, item]) => item.expiresAt <= now)
      .map(([cacheKey]) => cacheKey);
    for (const expiredKey of expiredKeys) memoryCache.delete(expiredKey);
    if (memoryCache.size > 300) memoryCache.clear();
  }
  memoryCache.set(key, {
    expiresAt: now + Math.max(1, ttlSeconds) * 1000,
    value,
  });
  return value;
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}
