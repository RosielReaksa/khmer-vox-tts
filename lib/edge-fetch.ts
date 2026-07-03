"use client";

// Cloudflare (or any edge proxy) can intercept a request and return its own
// HTML bot-verification challenge page instead of the JSON our API routes
// normally return. Before this module existed, callers did `response.json()`
// unconditionally, which throws `Unexpected token '<'...` on that HTML body
// and left the UI stuck showing a raw JS error forever — nothing ever told
// the browser to reload, which is the only way a Cloudflare JS challenge can
// actually run and clear itself (it cannot execute inside a background
// fetch()). This module centralizes:
//   1. Safely parsing a Response that is expected to be JSON.
//   2. Classifying failures as an edge challenge vs. a genuine app/network error.
//   3. A loop-safe `window.location.reload()` for when a challenge is stuck.

export type EdgeFetchFailureKind = "edge-challenge" | "app-error" | "network-error";

export type EdgeFetchResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: EdgeFetchFailureKind;
      message: string;
      retryable: boolean;
      status: number;
      // Present when the failure came back as parsed JSON (a normal app error
      // response, e.g. 409 with the current record attached) — absent for
      // edge-challenge/network failures, which never have a real body.
      data?: T;
    };

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * Safely parse a Response that is expected to contain JSON. Never throws —
 * non-JSON bodies (most commonly a Cloudflare/edge challenge HTML page) are
 * classified as `edge-challenge` instead of raising a SyntaxError.
 */
export async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage = "Request failed.",
): Promise<EdgeFetchResult<T>> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    try {
      const data = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        return {
          ok: false,
          kind: "app-error",
          message: data.error ?? fallbackMessage,
          retryable: RETRYABLE_STATUSES.has(response.status),
          status: response.status,
          data,
        };
      }
      return { ok: true, data };
    } catch {
      // Header claimed JSON but the body didn't parse — a genuine app bug,
      // not an edge challenge (those never send application/json).
      return {
        ok: false,
        kind: "app-error",
        message: `Malformed response (HTTP ${response.status}).`,
        retryable: RETRYABLE_STATUSES.has(response.status),
        status: response.status,
      };
    }
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    return classifyNonJsonFailure(response.status, contentType, bodyText);
  }

  return {
    ok: false,
    kind: "app-error",
    message: `Unexpected non-JSON response (HTTP ${response.status}).`,
    retryable: false,
    status: response.status,
  };
}

function classifyNonJsonFailure(
  status: number,
  contentType: string,
  bodyText: string,
): EdgeFetchResult<never> {
  const normalized = bodyText.toLowerCase();
  const hasChallengePhrase =
    normalized.includes("just a moment") ||
    normalized.includes("cloudflare") ||
    normalized.includes("attention required") ||
    normalized.includes("performing security verification") ||
    normalized.includes("checking your browser");

  // A non-2xx response with an HTML (or empty) body is already strong enough
  // signal on its own — real API errors from this app always return JSON, so
  // anything else here is almost certainly an edge proxy stepping in front of
  // the request. The phrase match above only upgrades the message shown to
  // the user; it is not required to classify the failure as a challenge.
  if (hasChallengePhrase || contentType.includes("text/html") || contentType === "") {
    return {
      ok: false,
      kind: "edge-challenge",
      message: hasChallengePhrase
        ? "Cloudflare temporarily blocked this request with a security check."
        : `The server returned an unexpected non-JSON response (HTTP ${status}), possibly a temporary edge security check.`,
      retryable: true,
      status,
    };
  }

  return {
    ok: false,
    kind: "app-error",
    message: `Request failed (HTTP ${status}).`,
    retryable: RETRYABLE_STATUSES.has(status),
    status,
  };
}

/** Convenience wrapper for one-off `fetch()` call sites (forms, action buttons, etc). */
export async function fetchJsonSafe<T>(
  url: string,
  init?: RequestInit,
  fallbackMessage?: string,
): Promise<EdgeFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return {
      ok: false,
      kind: "network-error",
      message: "Network error — check your connection and try again.",
      retryable: true,
      status: 0,
    };
  }
  return parseJsonResponse<T>(response, fallbackMessage);
}

// --- react-query integration --------------------------------------------

// Tracks consecutive edge-challenge failures per named scope (e.g. "dashboard",
// "admin") so a react-query queryFn can escalate to a guarded reload after
// repeated challenges, instead of surfacing an endless string of raw error
// banners while polling.
const consecutiveChallengesByScope = new Map<string, number>();

/**
 * `queryFn` helper for `useQuery`. Throws on failure (as react-query expects)
 * but triggers a guarded page reload after 3 consecutive edge-challenge
 * responses within the same scope.
 */
export async function fetchJsonForQuery<T>(scope: string, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const result = await parseJsonResponse<T>(response);
  if (result.ok) {
    consecutiveChallengesByScope.set(scope, 0);
    return result.data;
  }

  if (result.kind === "edge-challenge") {
    const streak = (consecutiveChallengesByScope.get(scope) ?? 0) + 1;
    consecutiveChallengesByScope.set(scope, streak);
    if (streak >= 3) {
      requestGuardedReload(`${streak} consecutive edge challenges in "${scope}" queries`);
    }
  } else {
    consecutiveChallengesByScope.set(scope, 0);
  }

  throw new Error(result.message);
}

// --- Loop-safe reload -----------------------------------------------------

const RELOAD_STORAGE_KEY = "edgeFetch:reloadLedger";
const RELOAD_MAX_ATTEMPTS = 3;
const RELOAD_WINDOW_MS = 5 * 60 * 1000;

type ReloadLedger = { count: number; windowStartedAt: number };

/**
 * Reload the page to let a stuck Cloudflare challenge clear itself. Capped at
 * `RELOAD_MAX_ATTEMPTS` reloads per `RELOAD_WINDOW_MS` via sessionStorage (a
 * real reload wipes all in-memory JS state, so a module-level counter would
 * never actually cap anything — sessionStorage is the only client store that
 * survives navigation within the same tab).
 *
 * Returns true if a reload was triggered, false if the cap was already hit
 * (callers should fall back to a "please refresh manually" message).
 */
export function requestGuardedReload(reason: string): boolean {
  if (typeof window === "undefined") return false;
  const ledger = readReloadLedger();
  const withinWindow = Date.now() - ledger.windowStartedAt < RELOAD_WINDOW_MS;
  const nextCount = withinWindow ? ledger.count + 1 : 1;
  if (nextCount > RELOAD_MAX_ATTEMPTS) return false;

  writeReloadLedger({ count: nextCount, windowStartedAt: withinWindow ? ledger.windowStartedAt : Date.now() });
  console.warn(`[edge-fetch] Reloading (attempt ${nextCount}/${RELOAD_MAX_ATTEMPTS}): ${reason}`);
  window.location.reload();
  return true;
}

function readReloadLedger(): ReloadLedger {
  try {
    const raw = sessionStorage.getItem(RELOAD_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ReloadLedger) : null;
    return parsed && typeof parsed.count === "number" ? parsed : { count: 0, windowStartedAt: Date.now() };
  } catch {
    return { count: 0, windowStartedAt: Date.now() };
  }
}

function writeReloadLedger(ledger: ReloadLedger) {
  try {
    sessionStorage.setItem(RELOAD_STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // best-effort; if sessionStorage is unavailable (e.g. private mode edge
    // cases) we simply lose the cap and rely on the caller's own thresholds.
  }
}
