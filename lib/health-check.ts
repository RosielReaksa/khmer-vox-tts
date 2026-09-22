import "server-only";

/**
 * Test that the database is actually reachable by issuing a trivial query.
 * Throws if the connection fails or times out, so callers can classify the
 * failure. Used by the deep health probe and any route that wants a
 * fail-fast DB check before issuing real queries.
 */
export async function testDatabaseConnectivity(timeoutMs = 5_000): Promise<void> {
  const { getPool } = await import("@/lib/postgres-store");

  let timeout: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      getPool().query("SELECT 1"),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Database health check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
