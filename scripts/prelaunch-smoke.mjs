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
  let text;
  try {
    text = await fs.readFile(path.join(rootDir, filename), "utf8");
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
    if (key && (override || process.env[key] === undefined)) {
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
    baseUrl: process.env.SMOKE_BASE_URL || "http://localhost:3000",
    email: process.env.SMOKE_USER_EMAIL || "",
    password: process.env.SMOKE_USER_PASSWORD || "SmokeTest123!",
    adminEmail: process.env.SMOKE_ADMIN_EMAIL || "",
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD || "",
    samplePath: process.env.SMOKE_CLONE_SAMPLE || "D:\\the api tts host\\khmer_voxcpm2_api_test.wav",
    liveTts: false,
    approve: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--live-tts") {
      args.liveTts = true;
      continue;
    }
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
        args[key] = rawValue;
      }
    }
  }

  if (!args.email) {
    args.email = `prelaunch+${Date.now()}@example.test`;
  }
  args.baseUrl = String(args.baseUrl).replace(/\/$/, "");
  return args;
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g);
}

class CookieJar {
  cookies = new Map();

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

async function request({ baseUrl, jar, method = "GET", route, body, headers: customHeaders }) {
  const headers = new Headers(customHeaders);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const cookieHeader = jar?.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);

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

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function skip(name, detail = "") {
  console.log(`SKIP ${name}${detail ? `: ${detail}` : ""}`);
}

function warn(name, detail = "") {
  console.log(`WARN ${name}${detail ? `: ${detail}` : ""}`);
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
  const me = await request({ baseUrl, jar, route: "/api/me" });
  if (me.status !== 200 || !me.data?.user?.isAdmin) {
    fail(`Signed in as ${email}, but this account is not an admin.`);
  }
  return jar;
}

function requireNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} is not numeric.`);
  return number;
}

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

async function createOrder(baseUrl, userJar) {
  const response = await request({
    baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/payments/orders",
    body: {
      planId: "starter",
      quantity: 1,
      userNote: `prelaunch smoke ${new Date().toISOString()}`,
    },
  });
  if (response.status !== 200 || !response.data?.order || !response.data?.checkout) {
    fail("Payment order creation failed.", `HTTP ${response.status}: ${response.text}`);
  }
  const { order, checkout } = response.data;
  if (order.status !== "pending") fail(`Expected pending order, got ${order.status}.`);
  if (!checkout.payload || !checkout.md5 || !checkout.imageDataUrl) {
    fail("KHQR response is missing payload, md5, or image.");
  }
  pass("KHQR order", `${order.id}, ${order.khqrAmount} ${order.khqrCurrency}, ${order.tokens} tokens`);
  return order;
}

async function checkManualPaymentMode(baseUrl, userJar, orderId) {
  const response = await request({
    baseUrl,
    jar: userJar,
    method: "POST",
    route: `/api/payments/orders/${orderId}/verify`,
  });
  if (response.status !== 200 || !response.data?.status) {
    fail("Payment verify endpoint failed.", `HTTP ${response.status}: ${response.text}`);
  }
  const status = response.data.status;
  if (status === "not_configured") {
    pass("Manual payment mode", response.data.message ?? "Bakong token not configured");
    return;
  }
  pass("Payment verify endpoint", status);
}

async function approveOrderIfRequested(args, order, beforeBalance, userJar) {
  if (!args.approve) {
    skip("admin approval", "run with --approve --admin-email=... --admin-password=...");
    return;
  }
  if (!args.adminEmail || !args.adminPassword) {
    fail("Admin approval requested but admin credentials are missing.");
  }

  const adminJar = await signInAdmin(args.baseUrl, args.adminEmail, args.adminPassword);
  pass("admin signin", args.adminEmail);

  const list = await request({
    baseUrl: args.baseUrl,
    jar: adminJar,
    route: "/api/admin/payments?status=pending",
  });
  if (list.status !== 200 || !Array.isArray(list.data?.orders)) {
    fail("Admin payment list failed.", `HTTP ${list.status}: ${list.text}`);
  }
  if (!list.data.orders.some((item) => item.id === order.id)) {
    fail(`Admin pending list did not include order ${order.id}.`);
  }
  pass("admin pending list", "order visible");

  const approval = await request({
    baseUrl: args.baseUrl,
    jar: adminJar,
    method: "POST",
    route: `/api/admin/payments/${order.id}/approve`,
    body: { adminNote: "Approved by prelaunch smoke test." },
  });
  if (approval.status !== 200 || approval.data?.order?.status !== "approved") {
    fail("Admin approval failed.", `HTTP ${approval.status}: ${approval.text}`);
  }
  pass("admin approval", "order approved");

  const after = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  const afterBalance = requireNumber(after.data?.user?.tokenBalance, "tokenBalance");
  if (afterBalance < beforeBalance + Number(order.tokens)) {
    fail(`Token credit failed. Expected at least ${beforeBalance + Number(order.tokens)}, got ${afterBalance}.`);
  }
  pass("token credit after approval", `${beforeBalance} -> ${afterBalance}`);
}

async function createApiKey(baseUrl, userJar) {
  const response = await request({
    baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/keys",
    body: { name: "Prelaunch Smoke Key" },
  });
  if (response.status !== 200 || !response.data?.rawKey || !response.data?.key?.id) {
    fail("API key creation failed.", `HTTP ${response.status}: ${response.text}`);
  }
  pass("API key creation", response.data.key.keyPrefix);
  return response.data.rawKey;
}

async function checkApiAuth(baseUrl) {
  const payload = { input: "សួស្តី", voice: "natural Khmer speech", model: "voxcpm2" };
  const noAuth = await request({
    baseUrl,
    method: "POST",
    route: "/api/v1/audio/speech",
    body: payload,
  });
  if (noAuth.status !== 401) fail("Public API without token should return 401.", `HTTP ${noAuth.status}`);
  pass("public API requires token", "HTTP 401");

  const invalid = await request({
    baseUrl,
    method: "POST",
    route: "/api/v1/audio/speech",
    headers: { Authorization: "Bearer invalid_test_key" },
    body: payload,
  });
  if (invalid.status !== 403) fail("Public API invalid token should return 403.", `HTTP ${invalid.status}`);
  pass("public API rejects invalid token", "HTTP 403");
}

async function runLiveTtsChecks(args, userJar, rawKey) {
  if (!args.liveTts) {
    skip("live TTS", "run with --live-tts to spend a few credits and call Modal");
    return;
  }

  const dashboard = await request({
    baseUrl: args.baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/generate",
    body: {
      text: "សួស្តី នេះជាការសាកល្បងសំឡេងខ្មែរ។",
      voice: "natural Khmer speech",
      model: "voxcpm2",
    },
  });
  if (dashboard.status !== 200 || !dashboard.data?.audioBase64) {
    fail("Dashboard TTS failed.", `HTTP ${dashboard.status}: ${dashboard.text}`);
  }
  pass("dashboard TTS", `${dashboard.data.creditsCharged} credits`);

  const publicApi = await request({
    baseUrl: args.baseUrl,
    method: "POST",
    route: "/api/v1/audio/speech",
    headers: { Authorization: `Bearer ${rawKey}` },
    body: {
      input: "សួស្តី នេះជាការសាកល្បង API។",
      voice: "natural Khmer speech",
      model: "voxcpm2",
    },
  });
  if (publicApi.status !== 200 || !publicApi.response.headers.get("content-type")?.includes("audio")) {
    fail("Public API TTS failed.", `HTTP ${publicApi.status}: ${publicApi.text}`);
  }
  pass("public API TTS", `${publicApi.response.headers.get("x-credits-charged") ?? "?"} credits`);

  let sample;
  try {
    sample = await fs.readFile(args.samplePath);
  } catch {
    warn("clone TTS", `sample not found: ${args.samplePath}`);
    return;
  }

  const form = new FormData();
  form.set("text", "សួស្តី នេះជាការសាកល្បងសំឡេងក្លូន។");
  form.set("voice", "same speaker as the reference audio, natural Khmer speech");
  form.set("model", "voxcpm2");
  form.set("voice_consent", "true");
  form.set("sample", new Blob([sample], { type: "audio/wav" }), path.basename(args.samplePath));

  const clone = await fetch(`${args.baseUrl}/api/generate-clone`, {
    method: "POST",
    headers: userJar.header() ? { Cookie: userJar.header() } : undefined,
    body: form,
    redirect: "manual",
  });
  const cloneText = await clone.text();
  let cloneData = null;
  try {
    cloneData = cloneText ? JSON.parse(cloneText) : null;
  } catch {
    cloneData = null;
  }
  if (clone.status !== 200 || !cloneData?.audioBase64) {
    fail("Dashboard clone TTS failed.", `HTTP ${clone.status}: ${cloneText}`);
  }
  pass("dashboard clone TTS", `${cloneData.creditsCharged} credits`);

  const batch = await request({
    baseUrl: args.baseUrl,
    jar: userJar,
    method: "POST",
    route: "/api/batch",
    body: {
      title: "Prelaunch batch smoke",
      input: ["សួស្តី នេះជាបន្ទាត់ទីមួយ។", "នេះជាបន្ទាត់ទីពីរ។"],
      voice: "natural Khmer speech",
      model: "voxcpm2",
    },
  });
  if (batch.status !== 202 || !batch.data?.job?.id) {
    fail("Dashboard batch queue failed.", `HTTP ${batch.status}: ${batch.text}`);
  }
  const jobId = batch.data.job.id;
  pass("dashboard batch queued", jobId);

  const workerHeaders = { "Content-Type": "application/json" };
  const workerSecret = cleanEnv("JOB_WORKER_SECRET");
  if (workerSecret) workerHeaders["x-job-worker-secret"] = workerSecret;
  await fetch(`${args.baseUrl}/api/internal/jobs/process`, {
    method: "POST",
    headers: workerHeaders,
    body: JSON.stringify({ jobId }),
  }).catch(() => undefined);

  let finalJob = null;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const status = await request({
      baseUrl: args.baseUrl,
      jar: userJar,
      route: `/api/batch/jobs/${encodeURIComponent(jobId)}`,
    });
    finalJob = status.data?.job ?? null;
    if (["completed", "partial", "failed"].includes(finalJob?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  if (!finalJob || finalJob.status !== "completed") {
    fail("Dashboard batch did not complete.", finalJob ? JSON.stringify(finalJob) : "No job status.");
  }
  pass("dashboard batch completed", `${finalJob.completedItems}/${finalJob.totalItems} items`);
}

async function main() {
  await loadEnvironment();
  const args = parseArgs(process.argv.slice(2));

  console.log("Prelaunch smoke test");
  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`User: ${args.email}`);

  const health = await request({ baseUrl: args.baseUrl, route: "/api/health" });
  if (health.status !== 200 || health.data?.status !== "ok") {
    fail("Health check failed.", `HTTP ${health.status}: ${health.text}`);
  }
  pass("health check", health.data.store ?? "unknown store");

  const { jar: userJar, mode } = await signUpOrSignIn(args.baseUrl, args.email, args.password);
  pass("auth", mode);

  const me = await request({ baseUrl: args.baseUrl, jar: userJar, route: "/api/me" });
  if (me.status !== 200 || !me.data?.user) {
    fail("User profile failed.", `HTTP ${me.status}: ${me.text}`);
  }
  const beforeBalance = requireNumber(me.data.user.tokenBalance, "tokenBalance");
  pass("user profile", `${beforeBalance} tokens`);

  await checkApiAuth(args.baseUrl);
  const order = await createOrder(args.baseUrl, userJar);
  await checkManualPaymentMode(args.baseUrl, userJar, order.id);
  await approveOrderIfRequested(args, order, beforeBalance, userJar);

  const rawKey = await createApiKey(args.baseUrl, userJar);
  await runLiveTtsChecks(args, userJar, rawKey);

  console.log("RESULT PASS");
}

main().catch((error) => {
  console.error("RESULT FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
