import "server-only";

const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const EXPOSED_HEADERS =
  "X-Generation-Id, X-Credits-Charged, X-Remaining-Tokens, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Concurrency-Limit, X-Concurrency-Remaining, Retry-After";
const MAX_AGE = "86400";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": MAX_AGE,
  };
}

export function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
