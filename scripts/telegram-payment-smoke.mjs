import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

async function loadEnvironment() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local", true);
}

function parseArgs(argv) {
  const args = {
    approve: false,
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3000",
    email: process.env.SMOKE_USER_EMAIL || "",
    password: process.env.SMOKE_USER_PASSWORD || "SmokeTest123!",
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD || "",
    plan: process.env.SMOKE_PLAN_ID || "creator",
    quantity: Number(process.env.SMOKE_QUANTITY || 1),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--approve") {
      args.approve = true;
      continue;
    }
    if (!value.startsWith("--")) continue;
    const [rawKey, rawValue] = value.includes("=")
      ? value.split(/=(.*)/s, 2)
      : [value, argv[index + 1]];
    if (!value.includes("=")) index += 1;
    const key = rawKey.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key in args && rawValue !== undefined) {
      args[key] = key === "quantity" ? Number(rawValue) : rawValue;
    }
  }

  if (!args.email) args.email = `telegram-smoke+${Date.now()}@example.test`;
  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  return args;
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromResponse(response) {
    const headers = response.headers;
    const cookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : splitSetCookie(headers.get("set-cookie"));

    for (const cookie of cookies) {
      const pair = cookie.split(";")[0] ?? "";
      const equalsAt = pair.indexOf("=");
      if (equalsAt === -1) continue;
      const key = pair.slice(0, equalsAt).trim();
      const value = pair.slice(equalsAt + 1).trim();
      if (!key) continue;
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request({ baseUrl, jar, method = "GET", route, body, headers: extraHeaders }) {
  const headers = new Headers(extraHeaders);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const cookieHeader = jar?.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  jar?.setFromResponse(response);

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { status: response.status, text, data };
}

function fail(message, detail = "") {
  throw new Error(detail ? `${message}\n${detail}` : message);
}

async function signUpOrSignIn(baseUrl, email, password) {
  let jar = new CookieJar();
  const signup = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signup",
    body: { email, password },
  });
  if (signup.status === 200) return jar;
  if (signup.status !== 409) fail("Signup failed.", `HTTP ${signup.status}: ${signup.text}`);

  jar = new CookieJar();
  const signin = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signin",
    body: { email, password },
  });
  if (signin.status !== 200) fail("Signin failed.", `HTTP ${signin.status}: ${signin.text}`);
  return jar;
}

function adminEmailsFromEnv() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function signInAdmin(baseUrl, email, password) {
  let jar = new CookieJar();
  const signin = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signin",
    body: { email, password },
  });

  if (signin.status === 409 || signin.status === 401 || signin.status === 404) {
    jar = new CookieJar();
    const signup = await request({
      baseUrl,
      jar,
      method: "POST",
      route: "/api/auth/signup",
      body: { email, password },
    });
    if (signup.status !== 200 && signup.status !== 409) {
      fail("Admin signup failed.", `HTTP ${signup.status}: ${signup.text}`);
    }
    if (signup.status === 409) {
      fail("Admin signin failed.", `HTTP ${signin.status}: ${signin.text}`);
    }
  } else if (signin.status !== 200) {
    fail("Admin signin failed.", `HTTP ${signin.status}: ${signin.text}`);
  }

  const me = await request({ baseUrl, jar, route: "/api/me" });
  if (me.status !== 200 || !me.data?.user?.isAdmin) {
    fail(`Signed in as ${email}, but this account is not admin.`);
  }
  return jar;
}

async function userBalance(baseUrl, jar) {
  const me = await request({ baseUrl, jar, route: "/api/me" });
  if (me.status !== 200 || !me.data?.user) {
    fail("Could not read user profile.", `HTTP ${me.status}: ${me.text}`);
  }
  return Number(me.data.user.tokenBalance);
}

async function main() {
  await loadEnvironment();
  const args = parseArgs(process.argv.slice(2));
  if (!["creator", "pro", "pack_5", "pack_10", "pack_15", "pack_20"].includes(args.plan)) {
    fail("--plan must be creator, pro, or an active token pack.");
  }
  if (args.quantity !== 1) {
    fail("--quantity must be 1 because each payment purchases one plan.");
  }

  console.log("Telegram payment smoke test");
  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`User: ${args.email}`);

  const jar = await signUpOrSignIn(args.baseUrl, args.email, args.password);
  console.log("PASS auth");
  const beforeBalance = await userBalance(args.baseUrl, jar);

  const orderResponse = await request({
    baseUrl: args.baseUrl,
    jar,
    method: "POST",
    route: "/api/payments/orders",
    body: {
      planId: args.plan,
      quantity: args.quantity,
      userNote: `telegram payment smoke ${new Date().toISOString()}`,
    },
  });
  if (orderResponse.status !== 200 || !orderResponse.data?.order) {
    fail("Payment order creation failed.", `HTTP ${orderResponse.status}: ${orderResponse.text}`);
  }

  const order = orderResponse.data.order;
  console.log(`PASS payment order: ${order.id}`);

  const updateId = Date.now();
  const transactionId = `TGSMOKE${updateId}`;
  const groupId = Number((process.env.TELEGRAM_PAYMENT_GROUP_ID || "-1004296512360").replaceAll('"', ""));
  const payload = {
    update_id: updateId,
    message: {
      message_id: Math.floor(updateId / 1000),
      date: Math.floor(Date.now() / 1000),
      from: {
        id: 8687242057,
        is_bot: true,
        first_name: "PayWay by ABA",
        username: "PayWay",
      },
      chat: {
        id: groupId,
        title: "Khmer voxx TTS payment",
        type: "supergroup",
      },
      text: [
        "Payment received successfully",
        `Amount: USD ${Number(order.khqrAmount).toFixed(2)}`,
        `Transaction ID: ${transactionId}`,
        `Reference: ${order.id}`,
        `Order ID: ${order.id}`,
      ].join("\n"),
    },
  };

  const headers = {};
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim().replace(/^"|"$/g, "");
  if (secret) headers["x-telegram-webhook-secret"] = secret;

  const webhook = await request({
    baseUrl: args.baseUrl,
    method: "POST",
    route: "/api/webhooks/telegram/payment",
    headers,
    body: payload,
  });
  if (webhook.status !== 200 || !webhook.data?.eventId) {
    fail("Telegram payment webhook failed.", `HTTP ${webhook.status}: ${webhook.text}`);
  }
  if (!["ready_to_approve", "auto_approved"].includes(webhook.data.decision)) {
    fail(`Expected ready_to_approve or auto_approved, got ${webhook.data.decision}.`, webhook.text);
  }

  console.log(`PASS telegram webhook: ${webhook.data.decision}`);
  console.log(`PASS event: ${webhook.data.eventId}`);

  if (args.approve && webhook.data.decision === "ready_to_approve") {
    const adminEmail = String(args.adminEmail || adminEmailsFromEnv()[0] || "").trim();
    const adminPassword = String(args.adminPassword || "").trim();
    if (!adminEmail || !adminPassword) {
      fail("Admin approval requested but admin credentials are missing.");
    }

    const adminJar = await signInAdmin(args.baseUrl, adminEmail, adminPassword);
    const approval = await request({
      baseUrl: args.baseUrl,
      jar: adminJar,
      method: "POST",
      route: `/api/admin/payment-telegram/${webhook.data.eventId}/approve`,
      body: { adminNote: "Approved by Telegram payment smoke test." },
    });
    if (approval.status !== 200 || approval.data?.order?.status !== "approved") {
      fail("Telegram event admin approval failed.", `HTTP ${approval.status}: ${approval.text}`);
    }

    const afterBalance = await userBalance(args.baseUrl, jar);
    if (afterBalance < beforeBalance + Number(order.tokens)) {
      fail(`Token balance did not increase correctly. Expected at least ${beforeBalance + Number(order.tokens)}, got ${afterBalance}.`);
    }
    console.log(`PASS admin approval: ${beforeBalance} -> ${afterBalance}`);
  } else if (args.approve) {
    console.log(`SKIP admin approval: webhook decision was ${webhook.data.decision}`);
  } else {
    console.log("SKIP admin approval: pass --approve with SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.");
  }

  console.log("RESULT PASS");
}

main().catch((error) => {
  console.error("RESULT FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
