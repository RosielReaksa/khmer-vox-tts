import "server-only";

import { existsSync, readFileSync } from "fs";
import path from "path";

export type UpstreamEndpoint = {
  url: string;
  token?: string;
  label?: string;
};

const endpointCreditsMap = new Map<string, number>();
let cachedEndpoints: UpstreamEndpoint[] | null = null;
const disabledEndpoints = new Map<string, { disabledAt: number; reason: string }>();
// Default cooldown for generic endpoint failures (5xx, timeouts).
const DEFAULT_DISABLE_DURATION_MS = 5 * 60 * 1000;
// Quota / billing exhaustion (HTTP 429 "spend limit reached", 402 payment
// required). Modal workspace billing cycles do NOT reset in 5 minutes — they
// reset at the next billing cycle (days, sometimes weeks). Use a long cooldown
// so the round-robin cycle does NOT keep hammering an exhausted account and
// burning the per-pod rate limit on requests that will all 429.
const QUOTA_DISABLE_DURATION_MS = 30 * 60 * 1000;
let roundRobinCounter = 0;
const quotaPattern = /(spend\s*limit|billing\s*cycle|quota|workspace\s*billing|payment\s*required|insufficient\s*credit)/i;

function parsePoolItems(value: unknown): UpstreamEndpoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: unknown) => {
      const obj = (item || {}) as Record<string, unknown>;
      return {
        url: String(obj.url ?? obj.endpoint ?? "").trim(),
        token: String(obj.token ?? obj.key ?? obj.apiKey ?? "").trim(),
        label: String(obj.label ?? obj.name ?? "").trim(),
      };
    })
    .filter((ep) => ep.url);
}

function mergePoolItems(primary: UpstreamEndpoint[], fallback: UpstreamEndpoint[]): UpstreamEndpoint[] {
  const merged = new Map<string, UpstreamEndpoint>();
  for (const endpoint of [...fallback, ...primary]) {
    const key = endpoint.url.trim().replace(/\/+$/, "").toLowerCase();
    if (!key) continue;
    const existing = merged.get(key);
    merged.set(key, {
      url: endpoint.url,
      token: endpoint.token || existing?.token || "",
      label: endpoint.label || existing?.label || "",
    });
  }
  return [...merged.values()];
}

export function updateEndpointCredits(url: string, remaining: number): void {
  endpointCreditsMap.set(url, remaining);
}

export function getEndpointCredits(url: string): number | undefined {
  return endpointCreditsMap.get(url);
}

export function forceReloadEndpoints(): void {
  cachedEndpoints = null;
}

export function getUpstreamEndpoints(): UpstreamEndpoint[] {
  const poolPath = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "tts-upstream-pool.json");
  let fileEndpoints: UpstreamEndpoint[] = [];
  try {
    if (existsSync(/*turbopackIgnore: true*/ poolPath)) {
      const content = readFileSync(/*turbopackIgnore: true*/ poolPath, "utf-8");
      fileEndpoints = parsePoolItems(JSON.parse(content));
    }
  } catch (err) {
    console.error("Error reading persistent pool from data/tts-upstream-pool.json:", err);
  }

  const poolStr = process.env.TTS_UPSTREAM_POOL?.trim();
  if (fileEndpoints.length > 0) {
    if (poolStr) {
      try {
        const parsed = JSON.parse(poolStr);
        return mergePoolItems(fileEndpoints, parsePoolItems(parsed));
      } catch (e) {
        console.error("Failed to parse TTS_UPSTREAM_POOL environment variable as JSON:", e);
        return fileEndpoints;
      }
    }
    return fileEndpoints;
  }

  if (cachedEndpoints) return cachedEndpoints;

  if (poolStr) {
    try {
      const parsed = JSON.parse(poolStr);
      if (Array.isArray(parsed)) {
        cachedEndpoints = parsePoolItems(parsed);
        if (cachedEndpoints.length > 0) {
          return cachedEndpoints;
        }
      }
    } catch (e) {
      console.error("Failed to parse TTS_UPSTREAM_POOL environment variable as JSON:", e);
    }
  }

  const url = process.env.TTS_UPSTREAM_URL?.trim();
  if (url) {
    return [
      {
        url,
        token: process.env.TTS_UPSTREAM_TOKEN?.trim(),
        label: "Default Upstream",
      },
    ];
  }

  return [];
}

export function selectUpstreamEndpoint(): UpstreamEndpoint | null {
  const pool = getUpstreamEndpoints();
  if (pool.length === 0) return null;

  const now = Date.now();
  const referenceDuration = Math.max(
    DEFAULT_DISABLE_DURATION_MS,
    QUOTA_DISABLE_DURATION_MS,
  );
  const available = pool.filter((ep) => {
    const disabled = disabledEndpoints.get(ep.url);
    if (!disabled) return true;
    if (now - disabled.disabledAt > referenceDuration) {
      disabledEndpoints.delete(ep.url);
      return true;
    }
    return false;
  });

  let candidates = available.length > 0 ? available : pool;
  const withCredit = candidates.filter((ep) => {
    const credits = getEndpointCredits(ep.url);
    return credits === undefined || credits > 5.0;
  });

  if (withCredit.length > 0) {
    candidates = withCredit;
  }

  const index = roundRobinCounter % candidates.length;
  roundRobinCounter++;
  return candidates[index];
}

export function disableEndpoint(url: string, reason: string, cooldownMs?: number): void {
  // Auto-detect quota / billing exhaustion and apply the long cooldown so
  // the round-robin does NOT keep cycling back into an exhausted account.
  // Callers can still override by passing an explicit cooldownMs.
  const isQuota = quotaPattern.test(reason);
  const effective =
    cooldownMs ?? (isQuota ? QUOTA_DISABLE_DURATION_MS : DEFAULT_DISABLE_DURATION_MS);
  // Compare against the larger of the two durations so the cooldown we store
  // is correct for either DEFAULT or QUOTA.
  const referenceDuration = Math.max(
    DEFAULT_DISABLE_DURATION_MS,
    QUOTA_DISABLE_DURATION_MS,
  );
  const effectiveDisabledAt = Date.now() - Math.max(0, referenceDuration - effective);
  disabledEndpoints.set(url, { disabledAt: effectiveDisabledAt, reason });
  console.warn(
    `[TTS LoadBalancer] Temporarily disabled endpoint: ${url} for ~${Math.round(effective / 1000)}s (${isQuota ? "quota" : "default"}). Reason: ${reason}`,
  );
}

export function resetEndpointPool(): void {
  disabledEndpoints.clear();
  roundRobinCounter = 0;
}

export function getBlockedEndpoints(): Array<{ url: string; reason: string; expiresAt: string }> {
  const now = Date.now();
  const list: Array<{ url: string; reason: string; expiresAt: string }> = [];
  for (const [url, data] of disabledEndpoints.entries()) {
    const expires = data.disabledAt + DISABLE_DURATION_MS;
    if (now < expires) {
      list.push({
        url,
        reason: data.reason,
        expiresAt: new Date(expires).toISOString(),
      });
    } else {
      disabledEndpoints.delete(url);
    }
  }
  return list;
}
