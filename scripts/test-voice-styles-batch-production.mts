/**
 * Production prosody + volume test via the BATCH API (async, no Cloudflare 524).
 *
 * Generates the SAME Khmer sentence once per voice style, polls each batch
 * job until it finishes, downloads the zip, extracts the WAV, then measures
 * per-file loudness + tempo (chars/sec).
 *
 * Usage:
 *   $env:BASE_URL="https://voxtts.online"
 *   npx tsx scripts/test-voice-styles-batch-production.mts
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output", "voice-styles-batch");

const baseUrl = (process.env.BASE_URL ?? "https://voxtts.online").replace(/\/$/, "");
const apiKey = readFileSync(join(repoRoot, "test-output", "seed-key.txt"), "utf8").trim();

const TEXT =
  "សួស្តីអ្នកទាំងអស់គ្នា។ នេះគឺជាការធ្វើតេស្តសំឡេងភាសាខ្មែរដើម្បីវាស់ស្ទង់ភាពខុសគ្នានៃល្បឿន និងកម្រិតសំឡេងរវាងរបបនិយាយផ្សេងៗ។ យើងសង្ឃឹមថានឹងលឺភាពខុសគ្នាច្បាស់លាស់រវាងរបបទាំងបួននេះ។";

const STYLES = ["normal", "calm", "urgent", "excited"] as const;
const VOICE = "female";

interface WavInfo {
  style: string;
  path: string;
  bytes: number;
  durationSeconds: number | null;
  rms: number | null;
  peak: number | null;
  charsPerSecond: number | null;
}

function readWavInfo(buf: Buffer, path: string, style: string, textChars: number): WavInfo {
  let dataOffset = -1;
  let dataSize = 0;
  for (let i = 12; i + 8 < buf.length; i++) {
    if (buf.toString("ascii", i, i + 4) === "data") {
      dataOffset = i + 8;
      dataSize = buf.readUInt32LE(i + 4);
      if (dataSize > buf.length - dataOffset) dataSize = buf.length - dataOffset;
      break;
    }
  }
  if (dataOffset < 0) {
    return { style, path, bytes: buf.length, durationSeconds: null, rms: null, peak: null, charsPerSecond: null };
  }
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  const samples = dataSize / 2;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const s = Math.abs(buf.readInt16LE(dataOffset + i * 2));
    if (s > peak) peak = s;
    const v = buf.readInt16LE(dataOffset + i * 2);
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples);
  const duration = dataSize / (sampleRate * channels * (bits / 8));
  return {
    style,
    path,
    bytes: buf.length,
    durationSeconds: duration,
    rms,
    peak,
    charsPerSecond: duration > 0 ? textChars / duration : null,
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollBatchJob(jobId: string): Promise<{ status: string; items: Array<{ index: number; status: string; error?: string }> }> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const res = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json()) as {
      job?: { status: string; id: string };
      items?: Array<{ index: number; status: string; error?: string }>;
    };
    if (!res.ok) throw new Error(`poll failed ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    const status = data.job?.status ?? "unknown";
    if (status === "completed" || status === "partial" || status === "failed") {
      return {
        status,
        items: (data.items ?? []).map((item) => ({
          index: item.index,
          status: item.status,
          error: item.error,
        })),
      };
    }
    await sleep(3000);
  }
  throw new Error("batch job timed out after 15 min");
}

async function generateOne(style: typeof STYLES[number]): Promise<WavInfo> {
  const submit = await fetch(`${baseUrl}/api/v1/audio/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [TEXT],
      voice: VOICE,
      voice_style: style,
      title: `voice-style-${style}`,
    }),
  });
  const submitBody = (await submit.json()) as { job?: { id: string }; error?: string };
  if (!submit.ok || !submitBody.job?.id) {
    throw new Error(`create batch failed ${submit.status}: ${JSON.stringify(submitBody).slice(0, 300)}`);
  }
  const jobId = submitBody.job.id;
  console.log(`     job: ${jobId}`);

  const polled = await pollBatchJob(jobId);
  const item = polled.items[0];
  if (!item || item.status !== "success") {
    throw new Error(`batch item failed (${polled.status}/${item?.status}): ${item?.error ?? "unknown"}`);
  }

  const dl = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${jobId}/download`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!dl.ok) {
    throw new Error(`download failed ${dl.status}: ${await dl.text().catch(() => "").then((t) => t.slice(0, 200))}`);
  }
  const jobDir = join(outputDir, `${VOICE}-${style}`);
  mkdirSync(jobDir, { recursive: true });
  const zipPath = join(jobDir, `${jobId}.zip`);
  writeFileSync(zipPath, Buffer.from(await dl.arrayBuffer()));
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${jobDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" },
  );
  const wavFile = readdirSync(jobDir).find((f) => f.endsWith(".wav"));
  if (!wavFile) throw new Error(`no wav in zip for ${style}`);
  const wavPath = join(jobDir, wavFile);
  const buf = readFileSync(wavPath);
  return readWavInfo(buf, wavPath, style, Array.from(TEXT).length);
}

console.log("=== Voice Style prosody + volume test (batch API) ===");
console.log(`API:      ${baseUrl}`);
console.log(`voice:    ${VOICE}`);
console.log(`text:     ${Array.from(TEXT).length} chars (single sentence)`);
console.log(`styles:   ${STYLES.join(", ")}`);
console.log(`output:   ${outputDir}`);
console.log("");

mkdirSync(outputDir, { recursive: true });

const results: WavInfo[] = [];
for (const style of STYLES) {
  console.log(`-> style="${style}" ...`);
  try {
    const info = await generateOne(style);
    results.push(info);
    console.log(
      `   ${info.path.split(/[\\/]/).slice(-2).join("/")}  ` +
        `dur=${info.durationSeconds?.toFixed(2)}s  ` +
        `rms=${info.rms?.toFixed(0)}  peak=${info.peak}  ` +
        `cps=${info.charsPerSecond?.toFixed(1)}`,
    );
  } catch (err) {
    console.error(`   FAIL style=${style}:`, err instanceof Error ? err.message : err);
  }
}

if (results.length < 2) {
  console.error("Not enough results to compare.");
  process.exit(1);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const cv = (xs: number[]) => (mean(xs) === 0 ? 0 : (stddev(xs) / mean(xs)) * 100);

console.log("");
console.log("=== Loudness consistency (Step 1: volume matching) ===");
const rms = results.map((r) => r.rms ?? 0);
console.log(`  RMS  mean=${mean(rms).toFixed(0)}  stddev=${stddev(rms).toFixed(0)}  CV=${cv(rms).toFixed(1)}%  (target < 5%)`);
const peak = results.map((r) => r.peak ?? 0);
console.log(`  Peak mean=${mean(peak).toFixed(0)}  stddev=${stddev(peak).toFixed(0)}  CV=${cv(peak).toFixed(1)}%`);

console.log("");
console.log("=== Prosody delta (Step 2: voice styles) ===");
const cpsByStyle = new Map(results.map((r) => [r.style, r.charsPerSecond ?? 0]));
const baseline = cpsByStyle.get("normal") ?? 0;
for (const r of results) {
  const c = r.charsPerSecond ?? 0;
  const delta = baseline > 0 ? ((c - baseline) / baseline) * 100 : 0;
  console.log(`  ${r.style.padEnd(8)} cps=${c.toFixed(1)}  delta_vs_normal=${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`);
}

console.log("");
console.log("=== Verdict ===");
const rmsCv = cv(rms);
if (rmsCv < 3) console.log(`  PASS: RMS loudness CV ${rmsCv.toFixed(1)}% — within-batch volume steady.`);
else if (rmsCv < 5) console.log(`  WARN: RMS loudness CV ${rmsCv.toFixed(1)}% — small drift, acceptable.`);
else console.log(`  FAIL: RMS loudness CV ${rmsCv.toFixed(1)}% — uneven volume across styles.`);

const cpsSorted = [...cpsByStyle.values()].sort((a, b) => a - b);
const cpsSpread = cpsSorted[cpsSorted.length - 1] - cpsSorted[0];
if (cpsSpread > 1.5) console.log(`  PASS: cps spread ${cpsSpread.toFixed(1)} — prosody styles are audible.`);
else if (cpsSpread > 0.5) console.log(`  WARN: cps spread ${cpsSpread.toFixed(1)} — prosody delta is subtle.`);
else console.log(`  FAIL: cps spread ${cpsSpread.toFixed(1)} — styles sound the same.`);
