import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export class ModalCapacityError extends Error {
  status: 429 | 503;
  code: "MODAL_CAPACITY_FULL" | "MODAL_CAPACITY_UNAVAILABLE";
  retryAt: Date;

  constructor(
    message: string,
    status: 429 | 503,
    code: "MODAL_CAPACITY_FULL" | "MODAL_CAPACITY_UNAVAILABLE",
    retryAt: Date,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

export type ModalGenerationLease = {
  enabled: boolean;
  release: () => Promise<void>;
};

type MemoryLease = {
  scope: string;
  expiresAt: number;
};

const SCHEMA_SQL = `
create table if not exists modal_generation_leases (
  id text primary key,
  scope text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists modal_generation_leases_scope_expires_idx
  on modal_generation_leases(scope, expires_at);
`;

const memoryLeases = new Map<string, MemoryLease>();

let pool: Pool | null = null;
let schemaReady = false;
let schemaReadyPromise: Promise<void> | null = null;

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(cleanEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeInt(name: string, fallback: number): number {
  const value = Number(cleanEnv(name));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function modalMaxActiveGenerations(): number {
  return readNonNegativeInt("MODAL_MAX_ACTIVE_GENERATIONS", 0);
}

function leaseMs(): number {
  return readPositiveInt("MODAL_GENERATION_LEASE_MS", 15 * 60_000);
}

function acquireTimeoutMs(): number {
  return readNonNegativeInt("MODAL_GENERATION_ACQUIRE_TIMEOUT_MS", 0);
}

function retryDelayMs(): number {
  return readPositiveInt("MODAL_GENERATION_ACQUIRE_RETRY_MS", 1_000);
}

function databaseUrl(): string {
  return cleanEnv("DATABASE_URL");
}

function usesPostgres(): boolean {
  const url = databaseUrl();
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function canUseMemoryFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Math.max(1, Math.min(2, Number(process.env.DATABASE_POOL_MAX ?? 5))),
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  schemaReadyPromise ??= getPool()
    .query(SCHEMA_SQL)
    .then(() => {
      schemaReady = true;
    })
    .catch((error: unknown) => {
      schemaReadyPromise = null;
      throw error;
    });
  return schemaReadyPromise;
}

function fullError(scope: string, retryAt: Date): ModalCapacityError {
  return new ModalCapacityError(
    `Modal generation capacity is full for ${scope}. The job will retry automatically.`,
    429,
    "MODAL_CAPACITY_FULL",
    retryAt,
  );
}

function unavailableError(scope: string): ModalCapacityError {
  return new ModalCapacityError(
    `Modal generation capacity limiter is unavailable for ${scope}.`,
    503,
    "MODAL_CAPACITY_UNAVAILABLE",
    new Date(Date.now() + retryDelayMs()),
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function acquireMemoryLease(scope: string, limit: number): ModalGenerationLease {
  const now = Date.now();
  const expiresAt = now + leaseMs();
  for (const [id, lease] of memoryLeases) {
    if (lease.expiresAt <= now) memoryLeases.delete(id);
  }

  const active = Array.from(memoryLeases.values()).filter((lease) => lease.scope === scope).length;
  if (active >= limit) {
    throw fullError(scope, new Date(now + retryDelayMs()));
  }

  const id = randomUUID();
  memoryLeases.set(id, { scope, expiresAt });
  let released = false;
  return {
    enabled: true,
    release: async () => {
      if (released) return;
      released = true;
      memoryLeases.delete(id);
    },
  };
}

async function acquirePostgresLease(scope: string, limit: number): Promise<ModalGenerationLease> {
  await ensureSchema();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + leaseMs());
  const client = await getPool().connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`modal-generation:${scope}`]);
    await client.query("delete from modal_generation_leases where scope = $1 and expires_at <= now()", [scope]);
    const countRows = await client.query<{ active_count: number | string }>(
      "select count(*)::int as active_count from modal_generation_leases where scope = $1",
      [scope],
    );
    const active = Number(countRows.rows[0]?.active_count ?? 0);
    if (active >= limit) {
      await client.query("commit");
      throw fullError(scope, new Date(Date.now() + retryDelayMs()));
    }
    await client.query(
      "insert into modal_generation_leases (id, scope, expires_at) values ($1, $2, $3)",
      [id, scope, expiresAt],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof ModalCapacityError) throw error;
    throw unavailableError(scope);
  } finally {
    client.release();
  }

  let released = false;
  return {
    enabled: true,
    release: async () => {
      if (released) return;
      released = true;
      try {
        await ensureSchema();
        await getPool().query("delete from modal_generation_leases where id = $1 and scope = $2", [id, scope]);
      } catch (error) {
        console.error("[modal-capacity] Failed to release Modal generation lease", error);
      }
    },
  };
}

async function tryAcquireModalGenerationLease(scope: string, limit: number): Promise<ModalGenerationLease> {
  if (!usesPostgres()) {
    if (canUseMemoryFallback()) return acquireMemoryLease(scope, limit);
    throw unavailableError(scope);
  }
  return acquirePostgresLease(scope, limit);
}

export async function acquireModalGenerationLease(scope = "global"): Promise<ModalGenerationLease> {
  const limit = modalMaxActiveGenerations();
  if (limit <= 0) {
    return {
      enabled: false,
      release: async () => undefined,
    };
  }

  const deadline = Date.now() + acquireTimeoutMs();
  for (;;) {
    try {
      return await tryAcquireModalGenerationLease(scope, limit);
    } catch (error) {
      if (!(error instanceof ModalCapacityError) || error.code !== "MODAL_CAPACITY_FULL") {
        throw error;
      }
      if (Date.now() >= deadline) throw error;
      await sleep(Math.min(retryDelayMs(), Math.max(1, deadline - Date.now())));
    }
  }
}

export function activeMemoryModalGenerationLeases(scope = "global"): number {
  const now = Date.now();
  for (const [id, lease] of memoryLeases) {
    if (lease.expiresAt <= now) memoryLeases.delete(id);
  }
  return Array.from(memoryLeases.values()).filter((lease) => lease.scope === scope).length;
}

