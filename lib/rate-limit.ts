import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import "server-only";

import type { UsagePolicy } from "@/lib/usage-policy";

type RateBucket = {
  count: number;
  resetAt: number;
  concurrent: number;
};

type BucketSnapshot = {
  requestCount: number;
  resetAtMs: number;
  concurrentCount: number;
};

export type UsageLimitResult =
  | {
      ok: true;
      headers: Record<string, string>;
      release: () => Promise<void>;
    }
  | {
      ok: false;
      status: 429 | 503;
      code: "RATE_LIMITED" | "TOO_MANY_CONCURRENT_REQUESTS" | "RATE_LIMIT_UNAVAILABLE";
      message: string;
      headers: Record<string, string>;
    };

const RATE_LIMIT_SCHEMA_SQL = `
create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_idx on rate_limit_buckets(reset_at);

create table if not exists rate_limit_leases (
  id text primary key,
  bucket_key text not null references rate_limit_buckets(bucket_key) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_leases_bucket_expires_idx
  on rate_limit_leases(bucket_key, expires_at);
`;

type BucketRow = QueryResultRow & {
  request_count: number | string;
  reset_at: Date | string;
};

const memoryBuckets = new Map<string, RateBucket>();

let memoryLastCleanupAt = 0;
let pool: Pool | null = null;
let schemaReady = false;
let schemaReadyPromise: Promise<void> | null = null;
let lastLeaseCleanupAt = 0;

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function databaseUrl(): string {
  return cleanEnv("DATABASE_URL");
}

function usesPostgres(): boolean {
  const url = databaseUrl();
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Math.max(1, Math.min(3, Number(process.env.DATABASE_POOL_MAX ?? 10))),
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureRateLimitSchema(): Promise<void> {
  if (schemaReady) return;
  schemaReadyPromise ??= getPool()
    .query(RATE_LIMIT_SCHEMA_SQL)
    .then(() => {
      schemaReady = true;
    })
    .catch((error: unknown) => {
      schemaReadyPromise = null;
      throw error;
    });
  return schemaReadyPromise;
}

async function cleanupStaleLeases(): Promise<void> {
  const now = Date.now();
  if (now - lastLeaseCleanupAt < 60 * 60 * 1000) return; // Once per hour
  lastLeaseCleanupAt = now;
  try {
    await getPool().query(
      "DELETE FROM rate_limit_leases WHERE expires_at <= now() - interval '1 hour'",
    );
    await getPool().query(
      "DELETE FROM rate_limit_buckets WHERE reset_at <= now() - interval '24 hours' AND updated_at <= now() - interval '24 hours'",
    );
  } catch (error) {
    console.error("[rate-limit] Failed to cleanup stale leases:", error);
  }
}

function releaseLeaseMs(): number {
  const value = Number(process.env.TTS_RATE_LIMIT_LEASE_MS);
  return Number.isInteger(value) && value >= 60_000 ? value : 15 * 60_000;
}

function memoryCleanup(now: number): void {
  if (now - memoryLastCleanupAt < 60_000) return;
  memoryLastCleanupAt = now;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.concurrent <= 0 && bucket.resetAt < now - 60_000) {
      memoryBuckets.delete(key);
    }
  }
}

function getMemoryBucket(key: string, policy: UsagePolicy, now: number): RateBucket {
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = {
      count: 0,
      resetAt: now + policy.windowMs,
      concurrent: existing?.concurrent ?? 0,
    };
    memoryBuckets.set(key, fresh);
    return fresh;
  }
  return existing;
}

function buildHeaders(policy: UsagePolicy, snapshot: BucketSnapshot, now: number): Record<string, string> {
  const retryAfterSeconds = Math.max(1, Math.ceil((snapshot.resetAtMs - now) / 1000));
  return {
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(policy.maxRequests),
    "X-RateLimit-Remaining": String(Math.max(0, policy.maxRequests - snapshot.requestCount)),
    "X-RateLimit-Reset": String(Math.ceil(snapshot.resetAtMs / 1000)),
    "X-Concurrency-Limit": String(policy.maxConcurrent),
    "X-Concurrency-Remaining": String(Math.max(0, policy.maxConcurrent - snapshot.concurrentCount)),
  };
}

function unavailableResult(policy: UsagePolicy): UsageLimitResult {
  const now = Date.now();
  return {
    ok: false,
    status: 503,
    code: "RATE_LIMIT_UNAVAILABLE",
    message: "Rate limiter is temporarily unavailable. Please try again.",
    headers: buildHeaders(
      policy,
      {
        requestCount: policy.maxRequests,
        resetAtMs: now + Math.max(1000, policy.windowMs),
        concurrentCount: policy.maxConcurrent,
      },
      now,
    ),
  };
}

function acquireMemoryUsageLimit(key: string, policy: UsagePolicy): UsageLimitResult {
  const now = Date.now();
  memoryCleanup(now);

  const bucket = getMemoryBucket(key, policy, now);
  const snapshot = {
    requestCount: bucket.count,
    resetAtMs: bucket.resetAt,
    concurrentCount: bucket.concurrent,
  };

  if (bucket.count >= policy.maxRequests) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many generation requests. Please wait and try again.",
      headers: buildHeaders(policy, snapshot, now),
    };
  }

  if (bucket.concurrent >= policy.maxConcurrent) {
    return {
      ok: false,
      status: 429,
      code: "TOO_MANY_CONCURRENT_REQUESTS",
      message: "Too many generation requests are already running. Please wait for one to finish.",
      headers: buildHeaders(policy, snapshot, now),
    };
  }

  bucket.count += 1;
  bucket.concurrent += 1;

  let released = false;
  return {
    ok: true,
    headers: buildHeaders(
      policy,
      {
        requestCount: bucket.count,
        resetAtMs: bucket.resetAt,
        concurrentCount: bucket.concurrent,
      },
      now,
    ),
    release: async () => {
      if (released) return;
      released = true;
      bucket.concurrent = Math.max(0, bucket.concurrent - 1);
    },
  };
}

async function resetExpiredWindow(
  client: PoolClient,
  bucketKey: string,
  resetAt: Date,
): Promise<BucketRow> {
  const rows = await client.query<BucketRow>(
    `
    update rate_limit_buckets
    set request_count = 0,
      reset_at = $2,
      updated_at = now()
    where bucket_key = $1
    returning request_count, reset_at
    `,
    [bucketKey, resetAt],
  );
  return rows.rows[0];
}

async function releasePostgresLease(leaseId: string, bucketKey: string): Promise<void> {
  try {
    await ensureRateLimitSchema();
    await getPool().query("delete from rate_limit_leases where id = $1 and bucket_key = $2", [
      leaseId,
      bucketKey,
    ]);
  } catch (error) {
    console.error("[rate-limit] Failed to release concurrency lease", error);
  }
}

async function acquirePostgresUsageLimit(key: string, policy: UsagePolicy): Promise<UsageLimitResult> {
  await ensureRateLimitSchema();
  // Fire-and-forget stale lease cleanup (runs at most once per hour).
  void cleanupStaleLeases();

  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const now = Date.now();
    const resetAt = new Date(now + policy.windowMs);
    const leaseId = randomUUID();
    const leaseExpiresAt = new Date(now + releaseLeaseMs());
    const client = await getPool().connect();

    try {
      await client.query("begin");
      await client.query(
        `
        insert into rate_limit_buckets (bucket_key, request_count, reset_at, updated_at)
        values ($1, 0, $2, now())
        on conflict (bucket_key) do nothing
        `,
        [key, resetAt],
      );

      const bucketRows = await client.query<BucketRow>(
        `
        select request_count, reset_at
        from rate_limit_buckets
        where bucket_key = $1
        for update
        `,
        [key],
      );
      let bucket = bucketRows.rows[0];
      if (new Date(bucket.reset_at).getTime() <= now) {
        bucket = await resetExpiredWindow(client, key, resetAt);
      }

      await client.query("delete from rate_limit_leases where bucket_key = $1 and expires_at <= now()", [
        key,
      ]);
      const leaseCountRows = await client.query<QueryResultRow & { concurrent_count: number | string }>(
        "select count(*)::int as concurrent_count from rate_limit_leases where bucket_key = $1",
        [key],
      );

      const snapshot = {
        requestCount: Number(bucket.request_count),
        resetAtMs: new Date(bucket.reset_at).getTime(),
        concurrentCount: Number(leaseCountRows.rows[0]?.concurrent_count ?? 0),
      };

      if (snapshot.requestCount >= policy.maxRequests) {
        await client.query("commit");
        client.release();
        return {
          ok: false,
          status: 429,
          code: "RATE_LIMITED",
          message: "Too many generation requests. Please wait and try again.",
          headers: buildHeaders(policy, snapshot, now),
        };
      }

      if (snapshot.concurrentCount >= policy.maxConcurrent) {
        await client.query("commit");
        client.release();
        return {
          ok: false,
          status: 429,
          code: "TOO_MANY_CONCURRENT_REQUESTS",
          message: "Too many generation requests are already running. Please wait for one to finish.",
          headers: buildHeaders(policy, snapshot, now),
        };
      }

      await client.query(
        `
        update rate_limit_buckets
        set request_count = request_count + 1,
          updated_at = now()
        where bucket_key = $1
        `,
        [key],
      );
      await client.query(
        `
        insert into rate_limit_leases (id, bucket_key, expires_at, created_at)
        values ($1, $2, $3, now())
        `,
        [leaseId, key, leaseExpiresAt],
      );
      await client.query("commit");
      client.release();

      return {
        ok: true,
        headers: buildHeaders(
          policy,
          {
            requestCount: snapshot.requestCount + 1,
            resetAtMs: snapshot.resetAtMs,
            concurrentCount: snapshot.concurrentCount + 1,
          },
          now,
        ),
        release: () => releasePostgresLease(leaseId, key),
      };
    } catch (error: unknown) {
      await client.query("rollback").catch(() => undefined);
      client.release();
      const err = error as Record<string, unknown>;
      const isDeadlock = err && (err.code === "40P01" || err.code === "40001" || String(err.message).includes("deadlock"));
      if (isDeadlock && attempt < maxRetries - 1) {
        const jitter = Math.random() * 200 + 50;
        console.warn(`[rate-limit] Deadlock detected during rate limit check for ${key}. Retrying in ${jitter.toFixed(0)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, jitter));
        continue;
      }
      console.error("[rate-limit] Failed to acquire Postgres rate limit", error);
      return unavailableResult(policy);
    }
  }
  return unavailableResult(policy);
}

export async function acquireUsageLimit(key: string, policy: UsagePolicy): Promise<UsageLimitResult> {
  if (!usesPostgres()) {
    return acquireMemoryUsageLimit(key, policy);
  }
  return acquirePostgresUsageLimit(key, policy);
}
