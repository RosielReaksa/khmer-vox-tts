import "server-only";

import { createApiError } from "@/lib/store";
import type { GenerationSource } from "@/lib/types";

const MAX_MESSAGE_CHARS = 2000;
const MAX_PREVIEW_CHARS = 500;
const MAX_PARAMS_CHARS = 2000;

// Header/field names that must never be persisted in the error log.
const SENSITIVE_KEYS = new Set([
  "authorization",
  "password",
  "token",
  "api_key",
  "apikey",
  "secret",
  "cookie",
]);

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") || null;
}

// Strip known-sensitive keys before persisting request params, so the error log
// never becomes a place where secrets or full payloads leak.
function sanitizeParams(params: Record<string, unknown> | null | undefined): string | null {
  if (!params) return null;
  try {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        safe[key] = "[redacted]";
        continue;
      }
      // Avoid storing large blobs (e.g. base64 audio / long input text).
      if (typeof value === "string" && value.length > 200) {
        safe[key] = `${value.slice(0, 200)}… (${value.length} chars)`;
      } else {
        safe[key] = value;
      }
    }
    return truncate(JSON.stringify(safe), MAX_PARAMS_CHARS);
  } catch {
    return null;
  }
}

export type ApiErrorLogInput = {
  request: Request;
  endpoint?: string;
  statusCode: number;
  errorMessage: string;
  source: GenerationSource;
  userId?: string | null;
  apiKeyId?: string | null;
  errorCode?: string | null;
  inputPreview?: string | null;
  requestParams?: Record<string, unknown> | null;
};

function resolveEndpoint(request: Request, endpoint?: string): string {
  if (endpoint) return endpoint;
  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}

// Fire-and-forget API error logger. Never throws and never blocks the response:
// a failure to write the log must not change the request outcome. Call it
// without awaiting (or with a floating promise) from route handlers.
export function logApiError(input: ApiErrorLogInput): void {
  void persist(input).catch((error) => {
    // Last-resort: log to stdout so we at least see logger failures in container logs.
    console.error("[api-error-log] failed to persist error", error);
  });
}

async function persist(input: ApiErrorLogInput): Promise<void> {
  const { request } = input;
  await createApiError({
    userId: input.userId ?? null,
    apiKeyId: input.apiKeyId ?? null,
    source: input.source,
    endpoint: resolveEndpoint(request, input.endpoint),
    method: request.method,
    statusCode: input.statusCode,
    errorCode: input.errorCode ?? null,
    errorMessage: truncate(input.errorMessage || "Unknown error", MAX_MESSAGE_CHARS),
    inputPreview: input.inputPreview ? truncate(input.inputPreview, MAX_PREVIEW_CHARS) : null,
    requestParams: sanitizeParams(input.requestParams),
    ipAddress: extractClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
}
