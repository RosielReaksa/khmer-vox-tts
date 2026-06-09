import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] ?? "check";
const dryRun = process.argv.includes("--dry-run");
const schemaLockKeys = [927514, 20317];

const requiredTables = [
  "users",
  "api_keys",
  "token_transactions",
  "generations",
  "batch_jobs",
  "batch_job_items",
  "payment_orders",
  "payment_webhook_events",
  "telegram_payment_events",
  "telegram_payment_actions",
  "payment_support_tickets",
  "rate_limit_buckets",
  "rate_limit_leases",
];

const requiredColumns = {
  users: [
    "id",
    "email",
    "password_hash",
    "suspended_at",
    "suspended_reason",
    "suspended_by_user_id",
    "created_at",
    "updated_at",
  ],
  api_keys: [
    "id",
    "user_id",
    "name",
    "key_prefix",
    "key_hash",
    "daily_token_limit",
    "monthly_token_limit",
    "max_concurrent_requests",
    "max_concurrent_jobs",
    "max_queued_jobs",
    "created_at",
    "last_used_at",
    "revoked_at",
  ],
  token_transactions: ["id", "user_id", "amount", "type", "note", "created_at"],
  generations: [
    "id",
    "user_id",
    "api_key_id",
    "mode",
    "source",
    "status",
    "model",
    "voice",
    "input_chars",
    "input_preview",
    "output_seconds",
    "credits_requested",
    "credits_charged",
    "latency_ms",
    "error_message",
    "audio_base64",
    "content_type",
    "created_at",
  ],
  batch_jobs: [
    "id",
    "user_id",
    "api_key_id",
    "mode",
    "source",
    "status",
    "title",
    "voice",
    "model",
    "external_id",
    "metadata_json",
    "total_items",
    "completed_items",
    "failed_items",
    "total_input_chars",
    "credits_estimated",
    "credits_charged",
    "output_seconds",
    "error_message",
    "clone_sample_base64",
    "clone_sample_mime_type",
    "clone_sample_file_name",
    "clone_consent_at",
    "clone_consent_text",
    "webhook_callback_url",
    "webhook_status",
    "webhook_attempts",
    "webhook_last_error",
    "webhook_last_attempt_at",
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
  ],
  batch_job_items: [
    "id",
    "job_id",
    "user_id",
    "item_index",
    "text",
    "input_preview",
    "voice",
    "model",
    "external_id",
    "speaker",
    "start_ms",
    "end_ms",
    "metadata_json",
    "status",
    "generation_id",
    "audio_base64",
    "content_type",
    "output_seconds",
    "credits_estimated",
    "credits_charged",
    "latency_ms",
    "error_message",
    "created_at",
    "updated_at",
  ],
  payment_orders: [
    "id",
    "user_id",
    "plan_id",
    "plan_name",
    "quantity",
    "unit_price_cents",
    "total_price_cents",
    "tokens",
    "payment_method",
    "status",
    "user_note",
    "payment_reference",
    "proof_image_data_url",
    "khqr_payload",
    "khqr_md5",
    "khqr_image_data_url",
    "khqr_currency",
    "khqr_amount",
    "khqr_expires_at",
    "payment_provider",
    "provider_transaction_id",
    "provider_reference",
    "provider_approval_code",
    "provider_status_code",
    "provider_status",
    "provider_amount",
    "provider_currency",
    "provider_payload",
    "paid_at",
    "admin_note",
    "token_transaction_id",
    "created_at",
    "updated_at",
    "approved_at",
    "approved_by_user_id",
    "rejected_at",
    "rejected_by_user_id",
    "expired_at",
  ],
  payment_webhook_events: [
    "id",
    "provider",
    "order_id",
    "payment_order_id",
    "event_status",
    "reason",
    "signature_valid",
    "signature_configured",
    "provider_transaction_id",
    "provider_reference",
    "provider_approval_code",
    "provider_status_code",
    "provider_status",
    "provider_amount",
    "provider_currency",
    "provider_payload",
    "raw_body",
    "created_at",
  ],
  telegram_payment_events: [
    "id",
    "telegram_update_id",
    "telegram_message_id",
    "chat_id",
    "chat_title",
    "sender_id",
    "sender_username",
    "sender_name",
    "sender_is_bot",
    "raw_text",
    "raw_payload",
    "parsed_status",
    "parsed_amount",
    "parsed_currency",
    "parsed_transaction_id",
    "parsed_reference",
    "matched_order_id",
    "decision_status",
    "decision_reason",
    "auto_approve_attempted",
    "created_at",
    "updated_at",
  ],
  telegram_payment_actions: [
    "id",
    "order_id",
    "action",
    "status",
    "reason",
    "telegram_user_id",
    "telegram_username",
    "telegram_first_name",
    "telegram_last_name",
    "callback_query_id",
    "message_chat_id",
    "message_id",
    "created_at",
  ],
  payment_support_tickets: [
    "id",
    "user_id",
    "payment_order_id",
    "status",
    "user_message",
    "admin_note",
    "resolved_by_user_id",
    "created_at",
    "updated_at",
    "resolved_at",
  ],
  rate_limit_buckets: ["bucket_key", "request_count", "reset_at", "updated_at"],
  rate_limit_leases: ["id", "bucket_key", "expires_at", "created_at"],
};

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile(filename, override = false) {
  const fullPath = path.join(rootDir, filename);
  let text;
  try {
    text = await fs.readFile(fullPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = parseEnvValue(trimmed.slice(equalsAt + 1));
    if (!key) continue;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function loadEnvironment() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local", true);
}

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function getDatabaseUrl() {
  const url = cleanEnv("DATABASE_URL");
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a Supabase/Postgres URL for this command.");
  }
  return url;
}

function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(cleanEnv("DATABASE_POOL_MAX") || 5),
    ssl: cleanEnv("DATABASE_SSL") === "false" ? false : { rejectUnauthorized: false },
  });
}

async function runSchema(pool) {
  const schemaSql = await fs.readFile(path.join(rootDir, "database", "schema.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    try {
      await client.query("select pg_advisory_xact_lock($1, $2)", schemaLockKeys);
      await client.query(schemaSql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
  } finally {
    client.release();
  }
}

async function checkSchema(pool) {
  const failures = [];

  for (const table of requiredTables) {
    const tableResult = await pool.query("select to_regclass($1) as name", [`public.${table}`]);
    if (!tableResult.rows[0]?.name) {
      failures.push(`missing table: ${table}`);
      continue;
    }

    const columnResult = await pool.query(
      `
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = $1
      `,
      [table],
    );
    const foundColumns = new Set(columnResult.rows.map((row) => row.column_name));
    for (const column of requiredColumns[table]) {
      if (!foundColumns.has(column)) {
        failures.push(`missing column: ${table}.${column}`);
      }
    }
  }

  const statusConstraint = await pool.query(`
    select check_clause
    from information_schema.check_constraints
    where constraint_name = 'payment_orders_status_check'
    limit 1
  `);
  if (!String(statusConstraint.rows[0]?.check_clause ?? "").includes("expired")) {
    failures.push("payment_orders_status_check does not include expired");
  }

  return failures;
}

function readinessWarnings() {
  const warnings = [];
  const localKhqrOnly = cleanEnv("PAYMENT_CHECKOUT_MODE").toLowerCase() === "local_khqr";
  const autoVerifyEnabled = cleanEnv("PAYMENT_AUTO_VERIFY_ENABLED").toLowerCase() === "true";
  const secret = cleanEnv("SESSION_SECRET");
  if (!secret || secret === "dev_only_change_me" || secret.length < 32) {
    warnings.push("SESSION_SECRET should be a unique 32+ character value.");
  }
  if (!cleanEnv("ADMIN_EMAILS")) {
    warnings.push("ADMIN_EMAILS should be set before production.");
  }
  if (!localKhqrOnly && !cleanEnv("PAYWAY_WEBHOOK_SECRET")) {
    warnings.push("PAYWAY_WEBHOOK_SECRET should be set before production.");
  }
  if (!cleanEnv("APP_PUBLIC_URL").startsWith("https://")) {
    warnings.push("APP_PUBLIC_URL should be your HTTPS production domain.");
  }
  if (!cleanEnv("KHQR_BAKONG_ACCOUNT_ID") && !cleanEnv("KHQR_ACCOUNT")) {
    warnings.push("KHQR_BAKONG_ACCOUNT_ID or KHQR_ACCOUNT is required for payment QR generation.");
  }
  if (autoVerifyEnabled && !cleanEnv("BAKONG_API_TOKEN")) {
    warnings.push("BAKONG_API_TOKEN should be set before production payment verification.");
  }
  if (!cleanEnv("TTS_UPSTREAM_URL") || !cleanEnv("TTS_UPSTREAM_TOKEN")) {
    warnings.push("TTS_UPSTREAM_URL and TTS_UPSTREAM_TOKEN are required for real TTS calls.");
  }
  if (!cleanEnv("JOB_WORKER_SECRET")) {
    warnings.push("JOB_WORKER_SECRET should be set before production batch processing.");
  }
  return warnings;
}

function printSafeConnectionInfo() {
  const url = new URL(getDatabaseUrl());
  console.log(`Database: ${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`);
  console.log(`SSL: ${cleanEnv("DATABASE_SSL") === "false" ? "disabled" : "enabled"}`);
}

async function setupDatabase() {
  const pool = createPool();
  try {
    printSafeConnectionInfo();
    await runSchema(pool);
    const failures = await checkSchema(pool);
    if (failures.length > 0) {
      throw new Error(`Schema setup finished but checks failed:\n- ${failures.join("\n- ")}`);
    }
    console.log("Database schema is ready.");
  } finally {
    await pool.end();
  }
}

async function checkDatabase() {
  const pool = createPool();
  try {
    printSafeConnectionInfo();
    const version = await pool.query("select version() as version");
    console.log(`Connected: ${String(version.rows[0]?.version ?? "unknown").split(",")[0]}`);

    const failures = await checkSchema(pool);
    if (failures.length > 0) {
      console.error("Database check failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("Database schema check passed.");
    }

    const warnings = readinessWarnings();
    if (warnings.length > 0) {
      console.log("");
      console.log("Production readiness warnings:");
      for (const warning of warnings) console.log(`- ${warning}`);
    }
  } finally {
    await pool.end();
  }
}

async function readJsonStore() {
  const storePath = path.join(rootDir, "data", "store.json");
  const text = await fs.readFile(storePath, "utf8");
  return JSON.parse(text);
}

function valueFor(record, field) {
  return record[field] === undefined ? null : record[field];
}

function camelToSnake(input) {
  return input.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

async function upsert(client, table, fields, record, updateFields = fields.filter((field) => field !== "id")) {
  const columns = fields.map(camelToSnake);
  const placeholders = fields.map((_, index) => `$${index + 1}`);
  const updates = updateFields.map((field) => `${camelToSnake(field)} = excluded.${camelToSnake(field)}`);
  const values = fields.map((field) => valueFor(record, field));

  await client.query(
    `
    insert into ${table} (${columns.join(", ")})
    values (${placeholders.join(", ")})
    on conflict (id) do update set ${updates.join(", ")}
    `,
    values,
  );
}

async function migrateJsonToPostgres() {
  const store = await readJsonStore();
  const counts = {
    users: store.users?.length ?? 0,
    apiKeys: store.apiKeys?.length ?? 0,
    tokenTransactions: store.tokenTransactions?.length ?? 0,
    generations: store.generations?.length ?? 0,
    batchJobs: store.batchJobs?.length ?? 0,
    batchJobItems: store.batchJobItems?.length ?? 0,
    paymentOrders: store.paymentOrders?.length ?? 0,
    paymentWebhookEvents: store.paymentWebhookEvents?.length ?? 0,
  };

  console.log("JSON store records:");
  console.log(JSON.stringify(counts, null, 2));
  if (dryRun) {
    console.log("Dry run only. No database writes were made.");
    return;
  }

  const pool = createPool();
  const client = await pool.connect();
  try {
    await runSchema(pool);
    await client.query("begin");

    for (const user of store.users ?? []) {
      await upsert(
        client,
        "users",
        [
          "id",
          "email",
          "passwordHash",
          "suspendedAt",
          "suspendedReason",
          "suspendedByUserId",
          "createdAt",
          "updatedAt",
        ],
        user,
      );
    }

    for (const apiKey of store.apiKeys ?? []) {
      await upsert(
        client,
        "api_keys",
        [
          "id",
          "userId",
          "name",
          "keyPrefix",
          "keyHash",
          "dailyTokenLimit",
          "monthlyTokenLimit",
          "maxConcurrentRequests",
          "maxConcurrentJobs",
          "maxQueuedJobs",
          "createdAt",
          "lastUsedAt",
          "revokedAt",
        ],
        apiKey,
      );
    }

    for (const transaction of store.tokenTransactions ?? []) {
      await upsert(
        client,
        "token_transactions",
        ["id", "userId", "amount", "type", "note", "createdAt"],
        transaction,
      );
    }

    for (const generation of store.generations ?? []) {
      await upsert(
        client,
        "generations",
        [
          "id",
          "userId",
          "apiKeyId",
          "mode",
          "source",
          "status",
          "model",
          "voice",
          "inputChars",
          "inputPreview",
          "outputSeconds",
          "creditsRequested",
          "creditsCharged",
          "latencyMs",
          "errorMessage",
          "audioBase64",
          "contentType",
          "createdAt",
        ],
        generation,
      );
    }

    for (const job of store.batchJobs ?? []) {
      await upsert(
        client,
        "batch_jobs",
        [
          "id",
          "userId",
          "apiKeyId",
          "mode",
          "source",
          "status",
          "title",
          "voice",
          "model",
          "externalId",
          "metadataJson",
          "totalItems",
          "completedItems",
          "failedItems",
          "totalInputChars",
          "creditsEstimated",
          "creditsCharged",
          "outputSeconds",
          "errorMessage",
          "cloneSampleBase64",
          "cloneSampleMimeType",
          "cloneSampleFileName",
          "cloneConsentAt",
          "cloneConsentText",
          "webhookCallbackUrl",
          "webhookStatus",
          "webhookAttempts",
          "webhookLastError",
          "webhookLastAttemptAt",
          "createdAt",
          "updatedAt",
          "startedAt",
          "completedAt",
        ],
        job,
      );
    }

    for (const item of store.batchJobItems ?? []) {
      await upsert(
        client,
        "batch_job_items",
        [
          "id",
          "jobId",
          "userId",
          "itemIndex",
          "text",
          "inputPreview",
          "voice",
          "model",
          "externalId",
          "speaker",
          "startMs",
          "endMs",
          "metadataJson",
          "status",
          "generationId",
          "audioBase64",
          "contentType",
          "outputSeconds",
          "creditsEstimated",
          "creditsCharged",
          "latencyMs",
          "errorMessage",
          "createdAt",
          "updatedAt",
        ],
        item,
      );
    }

    for (const order of store.paymentOrders ?? []) {
      await upsert(
        client,
        "payment_orders",
        [
          "id",
          "userId",
          "planId",
          "planName",
          "quantity",
          "unitPriceCents",
          "totalPriceCents",
          "tokens",
          "paymentMethod",
          "status",
          "userNote",
          "paymentReference",
          "proofImageDataUrl",
          "khqrPayload",
          "khqrMd5",
          "khqrImageDataUrl",
          "khqrCurrency",
          "khqrAmount",
          "khqrExpiresAt",
          "paymentProvider",
          "providerTransactionId",
          "providerReference",
          "providerApprovalCode",
          "providerStatusCode",
          "providerStatus",
          "providerAmount",
          "providerCurrency",
          "providerPayload",
          "paidAt",
          "adminNote",
          "tokenTransactionId",
          "createdAt",
          "updatedAt",
          "approvedAt",
          "approvedByUserId",
          "rejectedAt",
          "rejectedByUserId",
          "expiredAt",
        ],
        order,
      );
    }

    for (const event of store.paymentWebhookEvents ?? []) {
      await upsert(
        client,
        "payment_webhook_events",
        [
          "id",
          "provider",
          "orderId",
          "paymentOrderId",
          "eventStatus",
          "reason",
          "signatureValid",
          "signatureConfigured",
          "providerTransactionId",
          "providerReference",
          "providerApprovalCode",
          "providerStatusCode",
          "providerStatus",
          "providerAmount",
          "providerCurrency",
          "providerPayload",
          "rawBody",
          "createdAt",
        ],
        event,
      );
    }

    await client.query("commit");
    console.log("JSON store migration completed.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await loadEnvironment();

try {
  if (command === "setup") {
    await setupDatabase();
  } else if (command === "check") {
    await checkDatabase();
  } else if (command === "migrate-json") {
    await migrateJsonToPostgres();
  } else {
    console.error("Usage: node scripts/db.mjs <setup|check|migrate-json> [--dry-run]");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
