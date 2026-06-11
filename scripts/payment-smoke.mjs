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

function parseArgs(argv) {
  const args = {
    approve: false,
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3000",
    plan: process.env.SMOKE_PLAN_ID || "creator",
    quantity: Number(process.env.SMOKE_QUANTITY || 1),
    email: process.env.SMOKE_USER_EMAIL || "",
    password: process.env.SMOKE_USER_PASSWORD || "SmokeTest123!",
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--approve") {
      args.approve = true;
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
    args.email = `smoke+${Date.now()}@example.test`;
  }
  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  return args;
}

function adminEmailsFromEnv() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g);
}

class CookieJar {
  constructor(label) {
    this.label = label;
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

async function request({ baseUrl, jar, method = "GET", route, body }) {
  const headers = new Headers();
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const cookieHeader = jar?.header();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

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

  return { response, status: response.status, text, data };
}

function fail(message, detail = "") {
  const suffix = detail ? `\n${detail}` : "";
  throw new Error(`${message}${suffix}`);
}

async function signUpOrSignIn(baseUrl, email, password) {
  let jar = new CookieJar("user");
  const signup = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signup",
    body: { email, password },
  });

  if (signup.status === 200) {
    return { jar, mode: "signup" };
  }
  if (signup.status !== 409) {
    fail(`Signup failed for ${email}.`, `HTTP ${signup.status}: ${signup.text}`);
  }

  jar = new CookieJar("user");
  const signin = await request({
    baseUrl,
    jar,
    method: "POST",
    route: "/api/auth/signin",
    body: { email, password },
  });

  if (signin.status !== 200) {
    fail(`Signin failed for existing smoke user ${email}.`, `HTTP ${signin.status}: ${signin.text}`);
  }
  return { jar, mode: "signin" };
}

async function signInAdmin(baseUrl, email, password) {
  const jar = new CookieJar("admin");
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

  const me = await request({ baseUrl, jar, route: "/api/me" });
  if (me.status !== 200 || !me.data?.user?.isAdmin) {
    fail(`Signed in as ${email}, but this account is not admin.`);
  }
  return jar;
}

function requireNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    fail(`${label} is not a number.`);
  }
  return number;
}

async function main() {
  await loadEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const plan = String(args.plan);
  const quantity = requireNumber(args.quantity, "quantity");
  if (!["creator", "pro", "pack_5", "pack_10", "pack_15", "pack_20"].includes(plan)) {
    fail("--plan must be creator, pro, or an active token pack.");
  }
  if (quantity !== 1) {
    fail("--quantity must be 1 because each payment purchases one plan.");
  }

  console.log("Payment smoke test");
  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`User: ${args.email}`);
  console.log(`Order: ${plan} x ${quantity}`);

  const { jar: userJar, mode } = await signUpOrSignIn(args.baseUrl, args.email, args.password);
  console.log(`PASS auth: ${mode}`);

  const meBefore = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  if (meBefore.status !== 200 || !meBefore.data?.user) {
    fail("Could not read user profile.", `HTTP ${meBefore.status}: ${meBefore.text}`);
  }
  const beforeBalance = requireNumber(meBefore.data.user.tokenBalance, "tokenBalance");
  console.log(`PASS user profile: balance ${beforeBalance}`);

  const note = `payment smoke ${new Date().toISOString()}`;
  const orderResponse = await request({
    baseUrl: args.baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/payments/orders",
    body: { planId: plan, quantity, userNote: note },
  });
  if (orderResponse.status !== 200 || !orderResponse.data?.order || !orderResponse.data?.checkout) {
    fail("Payment order creation failed.", `HTTP ${orderResponse.status}: ${orderResponse.text}`);
  }

  const order = orderResponse.data.order;
  const checkout = orderResponse.data.checkout;
  if (order.status !== "pending") {
    fail(`Expected pending order, received ${order.status}.`);
  }
  if (!checkout.payload || !checkout.md5 || !checkout.imageDataUrl) {
    fail("Checkout response is missing KHQR payload, hash, or image data.");
  }
  console.log(`PASS payment order: ${order.id}`);
  console.log(`PASS KHQR checkout: ${order.khqrAmount} ${order.khqrCurrency}, tokens ${order.tokens}`);

  const verifyResponse = await request({
    baseUrl: args.baseUrl,
    jar: userJar,
    method: "POST",
    route: `/api/payments/orders/${order.id}/verify`,
  });
  if (verifyResponse.status !== 200 || !verifyResponse.data?.status) {
    fail("Payment verification endpoint failed.", `HTTP ${verifyResponse.status}: ${verifyResponse.text}`);
  }
  console.log(`PASS verify endpoint: ${verifyResponse.data.status}`);

  if (!args.approve) {
    console.log("SKIP admin approval: pass --approve with SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to test crediting.");
    console.log("RESULT PASS");
    return;
  }

  const adminEmails = adminEmailsFromEnv();
  const adminEmail = String(args.adminEmail || adminEmails[0] || "").trim();
  const adminPassword = String(args.adminPassword || "").trim();
  if (!adminEmail || !adminPassword) {
    fail("Admin approval requested but admin credentials are missing. Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.");
  }

  const adminJar = await signInAdmin(args.baseUrl, adminEmail, adminPassword);
  console.log(`PASS admin signin: ${adminEmail}`);

  const adminList = await request({
    baseUrl: args.baseUrl,
    jar: adminJar,
    route: "/api/admin/payments?status=pending",
  });
  if (adminList.status !== 200 || !Array.isArray(adminList.data?.orders)) {
    fail("Admin pending payment list failed.", `HTTP ${adminList.status}: ${adminList.text}`);
  }
  if (!adminList.data.orders.some((item) => item.id === order.id)) {
    fail(`Admin pending payment list did not include order ${order.id}.`);
  }
  console.log("PASS admin pending list");

  const approveResponse = await request({
    baseUrl: args.baseUrl,
    jar: adminJar,
    method: "POST",
    route: `/api/admin/payments/${order.id}/approve`,
    body: { adminNote: "Approved by payment smoke test." },
  });
  if (approveResponse.status !== 200 || approveResponse.data?.order?.status !== "approved") {
    fail("Admin approval failed.", `HTTP ${approveResponse.status}: ${approveResponse.text}`);
  }
  console.log("PASS admin approval");

  const meAfter = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  if (meAfter.status !== 200 || !meAfter.data?.user) {
    fail("Could not read user profile after approval.", `HTTP ${meAfter.status}: ${meAfter.text}`);
  }
  const afterBalance = requireNumber(meAfter.data.user.tokenBalance, "tokenBalance");
  const expectedMinimum = beforeBalance + Number(order.tokens);
  if (afterBalance < expectedMinimum) {
    fail(`Token balance did not increase correctly. Expected at least ${expectedMinimum}, got ${afterBalance}.`);
  }
  console.log(`PASS token credit: ${beforeBalance} -> ${afterBalance}`);
  console.log("RESULT PASS");
}

main().catch((error) => {
  console.error("RESULT FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
