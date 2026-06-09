import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storePath = path.join(rootDir, "data", "store.json");

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
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = parseEnvValue(trimmed.slice(equalsAt + 1));
    if (key && (override || process.env[key] === undefined)) process.env[key] = value;
  }
}

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3010",
    webhookPath: process.env.SMOKE_WEBHOOK_PATH || "/api/webhooks/telegram/payment-actions",
    telegramUserId: process.env.SMOKE_TELEGRAM_ADMIN_ID || "900001",
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    customerEmail: process.env.SMOKE_USER_EMAIL || `telegram-action-smoke+${Date.now()}@example.test`,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [rawKey, rawValue] = value.includes("=")
      ? value.split(/=(.*)/s, 2)
      : [value, argv[index + 1]];
    if (!value.includes("=")) index += 1;
    const key = rawKey.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key in args && rawValue !== undefined) args[key] = rawValue;
  }
  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  args.webhookPath = String(args.webhookPath).startsWith("/")
    ? String(args.webhookPath)
    : `/${args.webhookPath}`;
  return args;
}

function actionSecret() {
  const configured = cleanEnv("TELEGRAM_ACTION_SECRET") || cleanEnv("SESSION_SECRET");
  if (!configured || configured === "dev_only_change_me" || configured.length < 24) {
    return "dev_only_telegram_action_secret";
  }
  return configured;
}

function createCallbackData(orderId) {
  const ts = Math.floor(Date.now() / 1000).toString(36);
  const body = `approve:${orderId}:${ts}`;
  const sig = createHmac("sha256", actionSecret()).update(body).digest("base64url").slice(0, 16);
  return `pa:${orderId}:${ts}:${sig}`;
}

async function readStore() {
  const text = await fs.readFile(storePath, "utf8");
  return JSON.parse(text);
}

async function writeStore(store) {
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function ensureArray(store, key) {
  if (!Array.isArray(store[key])) store[key] = [];
}

async function seedPendingOrder(args) {
  const store = await readStore();
  for (const key of [
    "users",
    "tokenTransactions",
    "paymentOrders",
    "telegramPaymentEvents",
    "telegramPaymentActions",
  ]) {
    ensureArray(store, key);
  }
  store.schemaVersion = Math.max(Number(store.schemaVersion ?? 0), 20);

  const adminEmail = args.adminEmail || cleanEnv("ADMIN_EMAILS").split(/[,\s]+/).find(Boolean) || "admin@example.test";
  let admin = store.users.find((user) => String(user.email).toLowerCase() === adminEmail.toLowerCase());
  if (!admin) {
    admin = {
      id: `smoke-admin-${randomUUID()}`,
      email: adminEmail.toLowerCase(),
      passwordHash: "smoke-not-used",
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.users.push(admin);
  }

  let customer = store.users.find((user) => String(user.email).toLowerCase() === args.customerEmail.toLowerCase());
  if (!customer) {
    customer = {
      id: `smoke-user-${randomUUID()}`,
      email: args.customerEmail.toLowerCase(),
      passwordHash: "smoke-not-used",
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.users.push(customer);
  }

  const order = {
    id: `smoke-pay-${randomUUID()}`,
    userId: customer.id,
    planId: "starter",
    planName: "Starter",
    quantity: 1,
    unitPriceCents: 500,
    totalPriceCents: 500,
    tokens: 600,
    paymentMethod: "khqr",
    status: "pending",
    userNote: "telegram approval smoke",
    paymentReference: "smoke-reference",
    proofImageDataUrl: null,
    khqrPayload: null,
    khqrMd5: "smoke-md5",
    khqrImageDataUrl: null,
    khqrCurrency: "USD",
    khqrAmount: 5,
    khqrExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    paymentProvider: null,
    providerTransactionId: null,
    providerReference: null,
    providerApprovalCode: null,
    providerStatusCode: null,
    providerStatus: null,
    providerAmount: null,
    providerCurrency: null,
    providerPayload: null,
    paidAt: null,
    adminNote: null,
    tokenTransactionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    expiredAt: null,
  };
  store.paymentOrders.push(order);
  await writeStore(store);
  return { admin, customer, order };
}

async function postCallback(args, orderId) {
  const secret = cleanEnv("PAYMENT_APPROVAL_TELEGRAM_WEBHOOK_SECRET") || cleanEnv("TELEGRAM_WEBHOOK_SECRET");
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["x-telegram-webhook-secret"] = secret;

  const response = await fetch(`${args.baseUrl}${args.webhookPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      update_id: Date.now(),
      callback_query: {
        id: `smoke-callback-${Date.now()}`,
        from: {
          id: args.telegramUserId,
          username: "smoke_admin",
          first_name: "Smoke",
          last_name: "Admin",
        },
        message: {
          message_id: 12345,
          chat: { id: -10012345 },
        },
        data: createCallbackData(orderId),
      },
    }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data, text };
}

async function main() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local", true);
  const args = parseArgs(process.argv.slice(2));
  const { order, customer } = await seedPendingOrder(args);

  console.log(`Seeded pending order: ${order.id}`);
  console.log(`Customer: ${customer.email}`);
  console.log(`Callback base URL: ${args.baseUrl}`);
  console.log(`Webhook path: ${args.webhookPath}`);
  console.log(`Telegram user id: ${args.telegramUserId}`);
  console.log("Server must run with:");
  console.log(`  PAYMENT_APPROVAL_TELEGRAM_ADMIN_IDS=${args.telegramUserId}`);
  console.log("  PAYMENT_APPROVAL_TELEGRAM_DISABLE_SEND=true");

  const result = await postCallback(args, order.id);
  if (result.status !== 200 || result.data?.order?.status !== "approved") {
    console.error(`FAIL callback approval: HTTP ${result.status}`);
    console.error(result.text);
    process.exit(1);
  }

  const store = await readStore();
  const approved = store.paymentOrders.find((item) => item.id === order.id);
  const credited = store.tokenTransactions.some(
    (tx) => tx.userId === customer.id && tx.amount === order.tokens && String(tx.note).includes(order.id),
  );
  const audit = store.telegramPaymentActions.find(
    (action) => action.orderId === order.id && action.status === "success",
  );
  if (approved?.status !== "approved" || !credited || !audit) {
    console.error("FAIL local store verification after callback.");
    console.error(JSON.stringify({ status: approved?.status, credited, audit: Boolean(audit) }, null, 2));
    process.exit(1);
  }

  console.log("PASS telegram payment action approval.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
