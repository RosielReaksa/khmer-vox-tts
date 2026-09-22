#!/usr/bin/env node
/* eslint-disable */
// 100-concurrent-user smoke harness against the fixer VPS (khmer-vox-staging).
// Flow per virtual user: GET /app/signup (cookie) -> POST /api/auth/signup
// -> POST /api/generate -> poll /api/batch/jobs/<id> until done.
//
// Run from PowerShell with:
//   node scripts/loadtest-staging.cjs --vus 100 --base http://178.128.103.120
// Optional: --vus 10, --text "..." (default short Khmer sentence), --max 240s.

const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
}

const BASE = arg("--base", "http://178.128.103.120");
const VUS = parseInt(arg("--vus", "100"), 10);
const MAX_SECONDS = parseInt(arg("--max", "600"), 10);
const TEXT = arg("--text", "សួស្តា ស្តាប់ នេះគឺជាការសាកល្បងបង្កើតសំលេងខ្មែរជា WAV។");
const OUT = arg("--out", `test-output/loadtest-${VUS}users-${Date.now()}.json`);
const PARALLEL_POLLS = parseInt(arg("--polls", "30"), 10);

function fakeIp(vu) {
  return `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${(vu & 255) || 1}`;
}

async function getCsrf(vu) {
  const ip = fakeIp(vu);
  const res = await fetch(`${BASE}/app/signup`, {
    headers: { "X-Forwarded-For": ip },
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.raw?.()["set-cookie"] || [];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const csrfCookie = cookies.find((c) => c && c.startsWith("csrf-token="));
  if (!csrfCookie) throw new Error(`VU${vu}: no csrf cookie`);
  const csrf = csrfCookie.split(";")[0].split("=")[1];
  const allCookies = cookies.map((c) => c.split(";")[0]).join("; ");
  return { ip, csrf, allCookies };
}

async function signup(vu, ctx) {
  const email = `load_${Date.now()}_${vu}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": ctx.csrf,
      "X-Forwarded-For": ctx.ip,
      cookie: ctx.allCookies,
    },
    body: JSON.stringify({ email, password: "TestPass12345" }),
  });
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  if (res.status !== 200) {
    throw new Error(`VU${vu} signup HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  // Merge new session cookie from signup response.
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { email, sessionCookie: cookie || ctx.allCookies };
}

async function generate(ctx) {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": ctx.csrf,
      "X-Forwarded-For": ctx.ip,
      cookie: ctx.sessionCookie,
    },
    body: JSON.stringify({ text: TEXT, voice: "female", model: "voxcpm2" }),
  });
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  if (res.status === 202 || (res.status === 200 && json.queued)) {
    return { jobId: json.jobId, status: json.job?.status || "queued" };
  }
  throw new Error(`generate HTTP ${res.status}: ${body.slice(0, 200)}`);
}

async function poll(ctx, jobId) {
  const deadline = Date.now() + MAX_SECONDS * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${BASE}/api/batch/jobs/${jobId}`, {
      headers: { "X-Forwarded-For": ctx.ip, cookie: ctx.sessionCookie },
      cache: "no-store",
    });
    if (res.status !== 200) continue;
    const job = (await res.json())?.job;
    if (!job) continue;
    if (job.status === "completed" || job.status === "partial") return job;
    if (job.status === "failed" || job.status === "needs_review") {
      throw new Error(`job ${jobId} ${job.status}: ${job.errorMessage || ""}`);
    }
  }
  throw new Error(`job ${jobId} timed out after ${MAX_SECONDS}s`);
}

async function vuJob(vu) {
  const ctx0 = await getCsrf(vu);
  const ctx = await signup(vu, ctx0);
  const enqueueStart = Date.now();
  const { jobId } = await generate({ ...ctx0, sessionCookie: ctx.sessionCookie });
  const enqueueMs = Date.now() - enqueueStart;
  const startMs = Date.now();
  const job = await poll({ ...ctx0, sessionCookie: ctx.sessionCookie }, jobId);
  const e2eSec = (Date.now() - startMs) / 1000;
  return { vu, email: ctx.email, jobId, enqueueMs, e2eSec, completedItems: job.completedItems, totalItems: job.totalItems, status: job.status };
}

// Simple semaphore so we don't blow up the worker.
let inflight = 0;
const waiters = [];
async function acquire() {
  if (inflight < PARALLEL_POLLS) return;
  return new Promise((res) => waiters.push(res));
}
function release() {
  const next = waiters.shift();
  if (next) next();
}

async function runAll() {
  const t0 = Date.now();
  const results = [];
  const failures = [];
  const tasks = Array.from({ length: VUS }, (_, i) => i + 1).map(async (vu) => {
    await acquire();
    inflight++;
    try {
      const r = await vuJob(vu);
      results.push(r);
      process.stdout.write(`[ok ] VU${vu} job=${r.jobId.slice(0,8)} e2e=${r.e2eSec.toFixed(1)}s\n`);
    } catch (err) {
      failures.push({ vu, err: err.message });
      process.stdout.write(`[err] VU${vu} ${err.message}\n`);
    } finally {
      inflight--;
      release();
    }
  });
  await Promise.all(tasks);
  const wallSec = (Date.now() - t0) / 1000;
  const e2es = results.map((r) => r.e2eSec).sort((a, b) => a - b);
  const pct = (p) => (e2es.length ? e2es[Math.min(e2es.length - 1, Math.floor(e2es.length * p))] : null);
  const summary = {
    base: BASE,
    vus: VUS,
    wallSec: Number(wallSec.toFixed(1)),
    completed: results.length,
    failed: failures.length,
    signupFailed: failures.filter((f) => f.err.includes("signup")).length,
    generateFailed: failures.filter((f) => f.err.includes("generate")).length,
    pollFailed: failures.filter((f) => f.err.includes("timed out") || f.err.includes("failed") || f.err.includes("needs_review")).length,
    p50Sec: pct(0.5) != null ? Number(pct(0.5).toFixed(1)) : null,
    p95Sec: pct(0.95) != null ? Number(pct(0.95).toFixed(1)) : null,
    p99Sec: pct(0.99) != null ? Number(pct(0.99).toFixed(1)) : null,
    maxSec: e2es.length ? Number(e2es[e2es.length - 1].toFixed(1)) : null,
    completedItemsTotal: results.reduce((a, b) => a + (b.completedItems || 0), 0),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results, failures }, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFull report: ${OUT}`);
}

runAll().catch((e) => { console.error(e); process.exit(1); });
