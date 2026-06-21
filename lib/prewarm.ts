import "server-only";

import { getUpstreamEndpoints } from "@/lib/tts-endpoints";

/**
 * On-demand Modal GPU pre-warming.
 *
 * The Modal TTS containers scale to zero after their idle window
 * (VOXCPM_SCALEDOWN_WINDOW, default 300s). The first request after that pays a
 * ~58s cold start (measured) vs ~1.2s warm. Hitting the upstream `/health`
 * endpoint triggers the GPU class to spin up, so if we warm on a cheap signal
 * (user opens the workspace / focuses the text box) the container is usually
 * hot by the time they actually click Generate.
 *
 * Design notes:
 * - Server-side only: the upstream `/health` requires the endpoint bearer
 *   token, which must never reach the browser.
 * - Fire-and-forget: we do NOT block on the cold start finishing. A short
 *   timeout keeps the warm-up ping cheap; Modal still finishes booting the
 *   container in the background.
 * - Globally throttled: repeated focus/mount events (or many users) must not
 *   spam Modal and run up GPU cost. We only actually ping each endpoint at most
 *   once per WARM_THROTTLE_MS window and remember in-flight pings.
 */

function booleanEnv(name: string): boolean | null {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return null;
}

export function isPrewarmEnabled(): boolean {
  return booleanEnv("TTS_PREWARM_ENABLED") ?? true;
}

const WARM_THROTTLE_MS = Math.max(
  5_000,
  Number(process.env.TTS_PREWARM_THROTTLE_MS) || 60_000,
);
const WARM_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.TTS_PREWARM_TIMEOUT_MS) || 4_000,
);

// url -> last time we issued a warm ping (epoch ms). Module-scoped so it
// survives across requests within a single server process.
const lastWarmedAt = new Map<string, number>();
const inFlight = new Set<string>();

export type PrewarmResult = {
  attempted: number;
  skippedThrottled: number;
  endpoints: number;
  enabled: boolean;
  skippedReason?: "disabled";
};

function healthUrl(endpointUrl: string): string {
  const trimmed = endpointUrl.replace(/\/+$/, "");
  // Pool URLs point at the synthesis path (".../v1/audio/speech"); derive the
  // sibling "/health" on the same origin/app prefix.
  if (/\/v1\/audio\/speech$/i.test(trimmed)) {
    return trimmed.replace(/\/v1\/audio\/speech$/i, "/health");
  }
  if (/\/health$/i.test(trimmed)) return trimmed;
  return `${trimmed}/health`;
}

async function pingEndpoint(url: string, token?: string): Promise<void> {
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    await fetch(healthUrl(url), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
    });
  } catch {
    // A timeout here is expected and fine: the request still triggered Modal to
    // start the container. Warming is best-effort and must never throw.
  }
}

/**
 * Warm every configured upstream endpoint, subject to the global throttle.
 * Returns immediately after dispatching pings (does not await cold starts).
 */
export function prewarmUpstream(): PrewarmResult {
  if (!isPrewarmEnabled()) {
    return {
      attempted: 0,
      skippedThrottled: 0,
      endpoints: 0,
      enabled: false,
      skippedReason: "disabled",
    };
  }

  const endpoints = getUpstreamEndpoints();
  const now = Date.now();
  let attempted = 0;
  let skippedThrottled = 0;

  for (const endpoint of endpoints) {
    const key = endpoint.url.trim().replace(/\/+$/, "").toLowerCase();
    if (!key) continue;
    if (inFlight.has(key)) {
      skippedThrottled += 1;
      continue;
    }
    const last = lastWarmedAt.get(key) ?? 0;
    if (now - last < WARM_THROTTLE_MS) {
      skippedThrottled += 1;
      continue;
    }
    lastWarmedAt.set(key, now);
    inFlight.add(key);
    attempted += 1;
    void pingEndpoint(endpoint.url, endpoint.token).finally(() => {
      inFlight.delete(key);
    });
  }

  return {
    attempted,
    skippedThrottled,
    endpoints: endpoints.length,
    enabled: true,
  };
}
