import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loop = process.argv.includes("--loop");
const intervalMs = Number(process.env.JOB_WORKER_INTERVAL_MS || 3000);

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanEnv(name) {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function postJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const client = target.protocol === "https:" ? https : http;
    const timeoutMs = Math.max(30_000, Number(process.env.JOB_WORKER_REQUEST_TIMEOUT_MS || 1_800_000));

    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = {};
          if (text.trim()) {
            try {
              json = JSON.parse(text);
            } catch {
              json = { error: text.slice(0, 300) };
            }
          }
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            body: json,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Worker request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function processOne(workerId) {
  const baseUrl = cleanEnv("JOB_WORKER_BASE_URL") || cleanEnv("APP_PUBLIC_URL") || "http://localhost:3000";
  const url = `${baseUrl.replace(/\/$/, "")}/api/internal/jobs/process`;
  try {
    const response = await postJson(
      url,
      {
        "Content-Type": "application/json",
        "x-job-worker-secret": cleanEnv("JOB_WORKER_SECRET"),
        "x-worker-id": workerId,
      },
      { workerId },
    );
    const body = response.body;
    if (response.ok) {
      if (body.job) {
        console.log(`[${workerId}] status: ${response.status}, processed job: ${body.job.id} (items: ${body.itemCount})`);
      }
      return Boolean(body.processed);
    } else {
      console.log(`[${workerId}] status: ${response.status}, error: ${body.error || "Unknown"}`);
      return false;
    }
  } catch (err) {
    console.error(`[${workerId}] Fetch error: ${err.message}`);
    return false;
  }
}

await loadEnvFile(".env");
await loadEnvFile(".env.local", true);

const concurrency = Math.max(1, Number(process.env.JOB_WORKER_CONCURRENCY || 1));
console.log(`Starting Job Worker with concurrency level: ${concurrency}`);

let keepRunning = true;

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Stopping worker loop gracefully...");
  keepRunning = false;
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Stopping worker loop gracefully...");
  keepRunning = false;
});

async function runWorkerLoop(workerIndex) {
  const workerId = `worker-${process.pid}-${workerIndex}`;
  console.log(`[${workerId}] Worker loop ${workerIndex + 1} started.`);
  
  do {
    const processed = await processOne(workerId);
    if (loop && keepRunning) {
      const sleepTime = processed ? 500 : intervalMs;
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  } while (loop && keepRunning);
}

const loops = [];
for (let i = 0; i < concurrency; i++) {
  loops.push(runWorkerLoop(i));
}
await Promise.all(loops);
