import "server-only";

import { NextResponse } from "next/server";

/**
 * Error thrown when a database operation fails for an infrastructure reason
 * (connection lost, timeout, pool exhausted) rather than an application one
 * (constraint violation, not found). Routes can catch this and convert it
 * into a clean 503 instead of letting it propagate as an unhandled 500 that
 * the client sees as "Failed to fetch".
 */
export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is temporarily unavailable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Map a raw error to a DatabaseUnavailableError when it looks like an
 * infrastructure failure, or return the original error otherwise so callers
 * can still handle genuine app errors (constraint violations, etc.) normally.
 */
export function classifyDbError(error: unknown): Error {
  if (error instanceof DatabaseUnavailableError) return error;

  const message =
    error instanceof Error ? error.message : String(error ?? "");

  // pg / node-postgres connection-level failures.
  const infraPatterns = [
    "Connection terminated",
    "connect ECONNREFUSED",
    "connect ETIMEDOUT",
    "Connection terminated unexpectedly",
    "timeout exceeded",
    "too many clients",
    "remaining connection slots",
    "server closed the connection",
    "SSL connection is closed",
    "Postgres store requires DATABASE_URL",
    "Production requires DATABASE_URL",
  ];

  if (infraPatterns.some((pattern) => message.includes(pattern))) {
    return new DatabaseUnavailableError(message);
  }

  return error instanceof Error ? error : new Error(message);
}

/**
 * JSON 503 response for database-unavailable failures. Centralized so every
 * route returns the same shape and status code.
 */
export function databaseUnavailableResponse(error: unknown): NextResponse {
  const err = classifyDbError(error);
  console.error("[db-guard] Database unavailable:", err.message);
  return NextResponse.json(
    {
      error: "Service temporarily unavailable. Please try again in a moment.",
      code: "DATABASE_UNAVAILABLE",
    },
    { status: 503, headers: { "Retry-After": "10" } },
  );
}

/**
 * Wrap a database-handling block so that infrastructure failures become a
 * clean 503 JSON response while genuine app errors propagate as 500s (or
 * whatever the route's own error handling produces).
 *
 * Usage in a route:
 *   return withDatabaseGuard(async () => {
 *     const user = await getCurrentUser();   // may throw on DB down
 *     return NextResponse.json({ user });
 *   });
 */
export async function withDatabaseGuard(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return databaseUnavailableResponse(error);
    }
    const classified = classifyDbError(error);
    if (classified instanceof DatabaseUnavailableError) {
      return databaseUnavailableResponse(classified);
    }
    throw error;
  }
}
