/**
 * Seed prod DB with a test user + API key (no store/server-only imports).
 * Requires DATABASE_URL (e.g. via SSH tunnel to prod Postgres).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const now = new Date().toISOString();
const userId = randomUUID();
const email = `apitest+${Date.now()}@example.test`;
const passwordHash = await bcrypt.hash("ApiTest123!", 10);

const raw = randomBytes(24).toString("base64url");
const rawKey = `vx_live_${raw}`;
const keyPrefix = rawKey.slice(0, 16);
const keyHash = createHash("sha256").update(rawKey).digest("hex");
const keyId = randomUUID();

try {
  await client.query("BEGIN");
  await client.query(
    `insert into users (id, email, password_hash, created_at, updated_at) values ($1, $2, $3, $4, $4)`,
    [userId, email, passwordHash, now],
  );
  await client.query(
    `insert into token_transactions (id, user_id, amount, type, note, created_at) values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), userId, 100, "signup_bonus", "Free signup tokens", now],
  );
  await client.query(
    `insert into token_transactions (id, user_id, amount, type, note, created_at) values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), userId, 50_000, "admin_adjustment", "API consistency test seed", now],
  );
  await client.query(
    `insert into api_keys (id, user_id, name, key_prefix, key_hash, created_at) values ($1, $2, $3, $4, $5, $6)`,
    [keyId, userId, "Male 10-segment test", keyPrefix, keyHash, now],
  );

  const orderId = randomUUID();
  const txId = randomUUID();
  const tokens = 10_000;
  await client.query(
    `insert into token_transactions (id, user_id, amount, type, note, created_at) values ($1, $2, $3, 'purchase', $4, $5)`,
    [txId, userId, tokens, `Approved Creator payment order ${orderId}`, now],
  );
  await client.query(
    `insert into payment_orders (
      id, user_id, plan_id, plan_name, quantity, unit_price_cents,
      total_price_cents, tokens, payment_method, status, user_note,
      created_at, updated_at, approved_at, approved_by_user_id, token_transaction_id
    ) values ($1, $2, 'creator', 'Creator', 1, 150, 150, $3, 'khqr', 'approved', $4, $5, $5, $5, $6, $7)`,
    [orderId, userId, tokens, "API consistency test seed", now, userId, txId],
  );

  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test-output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "seed-key.txt"), rawKey);

console.log("=== Prod API key seeded ===");
console.log(`email:    ${email}`);
console.log(`userId:   ${userId}`);
console.log(`key saved: test-output/seed-key.txt`);
