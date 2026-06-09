import { createHmac } from "node:crypto";
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

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3000",
    plan: process.env.SMOKE_PLAN_ID || "starter",
    quantity: Number(process.env.SMOKE_QUANTITY || 1),
    email: process.env.SMOKE_USER_EMAIL || "",
    password: process.env.SMOKE_USER_PASSWORD || "SmokeTest123!",
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD || "",
    allowNonLocalhost: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-non-localhost") {
      args.allowNonLocalhost = true;
      continue;
    }
    if (value.startsWith("--")) {
      const [rawKey, rawValue] = value.includes("=")
        ? value.split(/=(.*)/s, 2)
        : [value, argv[index + 1]];
      if (!value.includes("=")) index += 1;
      const key = rawKey.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key in args && rawValue !== undefined) {
        args[key] = key === "quantity" ? Number(rawValue) : rawValue;
      }
    }
  }

  if (!args.email) {
    args.email = `webhook-smoke+${Date.now()}@example.test`;
  }
  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  return args;
}

function assertLocalhost(baseUrl, allowNonLocalhost) {
  const url = new URL(baseUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!local && !allowNonLocalhost) {
    throw new Error("Refusing to send a fake paid webhook to a non-localhost URL. Pass --allow-non-localhost only for a controlled staging app.");
  }
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
      if (value) {
        this.cookies.set(key, value);
      } else {
        this.cookies.delete(key);
      }
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request({ baseUrl, jar, method = "GET", route, body, headers: customHeaders }) {
  const headers = new Headers(customHeaders);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const cookieHeader = jar?.header();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
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
  return { response, status: response.status, text, data };
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
  if (signup.status === 200) return { jar, mode: "signup" };
  if (signup.status !== 409) {
    fail(`Signup failed for ${email}.`, `HTTP ${signup.status}: ${signup.text}`);
  }

  jar = new CookieJar();
  const signin = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signin",
    body: { email, password },
  });
  if (signin.status !== 200) {
    fail(`Signin failed for ${email}.`, `HTTP ${signin.status}: ${signin.text}`);
  }
  return { jar, mode: "signin" };
}

async function signInAdmin(baseUrl, email, password) {
  const jar = new CookieJar();
  const signin = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signin",
    body: { email, password },
  });
  if (signin.status !== 200) {
    fail(`Admin signin failed for ${email}.`, `HTTP ${signin.status}: ${signin.text}`);
  }
  return jar;
}

function signedHeaders(rawBody) {
  const headers = { "Content-Type": "application/json" };
  const secret = cleanEnv("PAYWAY_WEBHOOK_SECRET");
  if (!secret) {
    return { headers, signed: false };
  }
  headers["x-payway-hmac-sha512"] = createHmac("sha512", secret).update(rawBody).digest("base64");
  return { headers, signed: true };
}

async function main() {
  await loadEnvironment();
  const args = parseArgs(process.argv.slice(2));
  assertLocalhost(args.baseUrl, args.allowNonLocalhost);

  console.log("PayWay webhook smoke test");
  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`User: ${args.email}`);

  const { jar: userJar, mode } = await signUpOrSignIn(args.baseUrl, args.email, args.password);
  console.log(`PASS auth: ${mode}`);

  const before = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  if (before.status !== 200 || !before.data?.user) {
    fail("Could not read user profile before webhook.", `HTTP ${before.status}: ${before.text}`);
  }
  const beforeBalance = Number(before.data.user.tokenBalance);

  const orderResponse = await request({
    baseUrl: args.baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/payments/orders",
    body: {
      planId: args.plan,
      quantity: Number(args.quantity),
      userNote: `payway webhook smoke ${new Date().toISOString()}`,
    },
  });
  if (orderResponse.status !== 200 || !orderResponse.data?.order) {
    fail("Payment order creation failed.", `HTTP ${orderResponse.status}: ${orderResponse.text}`);
  }

  const order = orderResponse.data.order;
  console.log(`PASS payment order: ${order.id}`);

  const webhookPayload = {
    merchant_ref: order.id,
    payment_status_code: "0",
    payment_status: "success",
    transaction_id: `smoke_${Date.now()}`,
    bank_ref: `bank_${Date.now()}`,
    original_amount: String(order.khqrAmount),
    original_currency: order.khqrCurrency,
    transaction_date: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(webhookPayload);
  const { headers, signed } = signedHeaders(rawBody);
  if (signed) {
    console.log("PASS signature: signed with PAYWAY_WEBHOOK_SECRET");
  } else {
    console.log("WARN signature: PAYWAY_WEBHOOK_SECRET is not set; local dev accepts unsigned callbacks only.");
  }

  const webhookResponse = await request({
    baseUrl: args.baseUrl,
    method: "POST",
    route: "/api/webhooks/payway",
    headers,
    body: rawBody,
  });
  if (webhookResponse.status !== 200 || !webhookResponse.data?.ok || !webhookResponse.data?.credited) {
    fail("PayWay webhook did not credit the order.", `HTTP ${webhookResponse.status}: ${webhookResponse.text}`);
  }
  console.log("PASS webhook credited tokens");

  const after = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  if (after.status !== 200 || !after.data?.user) {
    fail("Could not read user profile after webhook.", `HTTP ${after.status}: ${after.text}`);
  }
  const afterBalance = Number(after.data.user.tokenBalance);
  if (afterBalance < beforeBalance + Number(order.tokens)) {
    fail(`Token balance did not increase. Expected at least ${beforeBalance + Number(order.tokens)}, got ${afterBalance}.`);
  }
  console.log(`PASS token balance: ${beforeBalance} -> ${afterBalance}`);

  if (args.adminEmail && args.adminPassword) {
    const adminJar = await signInAdmin(args.baseUrl, args.adminEmail, args.adminPassword);
    const events = await request({
      baseUrl: args.baseUrl,
      jar: adminJar,
      route: `/api/admin/payment-webhooks?orderId=${encodeURIComponent(order.id)}&limit=5`,
    });
    if (events.status !== 200 || !events.data?.events?.some((event) => event.orderId === order.id)) {
      fail("Admin webhook event lookup failed.", `HTTP ${events.status}: ${events.text}`);
    }
    console.log("PASS admin webhook event lookup");
  } else {
    console.log("SKIP admin event lookup: set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to verify the admin audit API.");
  }

  console.log("RESULT PASS");
}

main().catch((error) => {
  console.error("RESULT FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
