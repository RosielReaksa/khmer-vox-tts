/**
 * Production consistency test: 10 male-voice segments via voxtts.online API.
 *
 * Uses batch API (10 separate lines, same voice) — full website stack including
 * chunk-continuation settings on the worker.
 *
 * Prereq: test-output/seed-key.txt (from seed-paid-api-user.mts against prod DB)
 *
 *   $env:BASE_URL="https://voxtts.online"
 *   npx tsx scripts/test-male-10-segment-production.mts
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output", "male-10-segment");

const baseUrl = (process.env.BASE_URL || "https://voxtts.online").replace(/\/$/, "");
const apiKey = readFileSync(join(repoRoot, "test-output", "seed-key.txt"), "utf8").trim();

const segments = [
  "សួស្តី! នេះគឺជាការសាកល្បងផ្នែកទីមួយ សម្រាប់សំឡេងបុរសខ្មែរ។",
  "ផ្នែកទីពីរ៖ បច្ចេកវិទ្យាសំឡេងកំពុងរីកចម្រើនយ៉ាងលឿន និងមានប្រសិទ្ធភាព។",
  "ផ្នែកទីបី៖ យើងពិនិត្យថាតើសំឡេងនៅមានលក្ខណៈដូចគ្នាឬអត់។",
  "ផ្នែកទីបួន៖ អត្ថបទនេះសរសេរដោយមិនមានស្លាកអារម្មណ៍ ឬអារម្មណ៍ពិសេសណាមួយ។",
  "ផ្នែកទីប្រាំ៖ សំឡេងគួរតែស្ថិតស្ថេរក្នុងការនិយាយធម្មតា មិនរីកឬធ្លាក់ចុះ។",
  "ផ្នែកទីប្រាំមួយ៖ ល្បឿននិយាយគួរតែស្មើគ្នា មិនលឿន ឬយឺតខុសគ្នាច្រើន។",
  "ផ្នែកទីប្រាំពីរ៖ នេះជាការសាកល្បងបន្តពីផ្នែកមុន ដើម្បីពិនិត្យភាពស៊ីសង្វាក់។",
  "ផ្នែកទីប្រាំបី៖ ប្រព័ន្ធ Khmer Vox TTS ប្រើម៉ូឌែល VoxCPM2 សម្រាប់បង្កើតសំឡេង។",
  "ផ្នែកទីប្រំបួន៖ ការបង្កើតសំឡេងវែងត្រូវការភាពស្មីសង្វាក់រវាងផ្នែកនីមួយៗ។",
  "ផ្នែកទីដប់៖ អរគុណសម្រាប់ការសាកល្បង សូមស្តាប់ថាតើសំឡេងដូចគ្នាឬទេ។",
];

function wavDurationSeconds(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
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
  if (dataOffset < 0) return null;
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  if (!sampleRate || !channels || !bits) return null;
  return dataSize / (sampleRate * channels * (bits / 8));
}

function rmsOfWavPcm(buf: Buffer): number | null {
  if (buf.length < 44) return null;
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
  if (dataOffset < 0 || dataSize < 2) return null;
  const samples = dataSize / 2;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = buf.readInt16LE(dataOffset + i * 2);
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollBatchJob(jobId: string): Promise<{ status: string; items: Array<{ index: number; status: string; error?: string }> }> {
  for (let attempt = 0; attempt < 180; attempt++) {
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
  throw new Error("batch job timed out");
}

console.log("=== Male voice 10-segment production test ===");
console.log(`API:   ${baseUrl}`);
console.log(`voice: male`);
console.log(`segments: ${segments.length}`);
console.log("");

mkdirSync(outputDir, { recursive: true });

const createRes = await fetch(`${baseUrl}/api/v1/audio/batch`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    input: segments,
    voice: "male",
    model: "voxcpm2",
    title: "male-10-segment-consistency-test",
  }),
});

const createBody = (await createRes.json()) as { job?: { id: string }; error?: string };
if (!createRes.ok || !createBody.job?.id) {
  console.error("FAIL create batch:", createRes.status, createBody);
  process.exit(1);
}

const jobId = createBody.job.id;
console.log(`batch job: ${jobId}`);
console.log("waiting for worker...");

const polled = await pollBatchJob(jobId);
console.log(`job status: ${polled.status}`);
console.log(`items: ${polled.items.length} total`);

const results: Array<{
  index: number;
  bytes: number;
  duration: number | null;
  rms: number | null;
  path: string;
}> = [];

for (const item of polled.items.sort((a, b) => a.index - b.index)) {
  if (item.status !== "success") {
    console.log(`  segment ${item.index + 1}: SKIP (${item.status}) ${item.error ?? ""}`);
  }
}

const zipRes = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${jobId}/download`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!zipRes.ok) {
  console.error("FAIL download zip:", zipRes.status, await zipRes.text().catch(() => ""));
  process.exit(1);
}

const zipPath = join(outputDir, `${jobId}.zip`);
writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));
try {
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" },
  );
} catch {
  console.error("Could not unzip — open", zipPath, "manually");
  process.exit(1);
}

const wavFiles = readdirSync(outputDir)
  .filter((f) => f.endsWith(".wav"))
  .sort();

for (const file of wavFiles) {
  const path = join(outputDir, file);
  const buf = readFileSync(path);
  const duration = wavDurationSeconds(buf);
  const rms = rmsOfWavPcm(buf);
  const index = wavFiles.indexOf(file) + 1;
  results.push({ index, bytes: buf.length, duration, rms, path });
  console.log(
    `  ${file}: ${(buf.length / 1024).toFixed(1)} KB, ` +
      `${duration?.toFixed(2) ?? "?"}s, RMS=${rms?.toFixed(0) ?? "?"}`,
  );
}

console.log("");
console.log("=== Analysis ===");
if (results.length < 2) {
  console.log("Not enough segments to compare.");
  process.exit(1);
}

const durations = results.map((r) => r.duration).filter((d): d is number => d != null);
const rmsValues = results.map((r) => r.rms).filter((v): v is number => v != null);

function coeffVar(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / avg) * 100;
}

const durCv = durations.length ? coeffVar(durations) : null;
const rmsCv = rmsValues.length ? coeffVar(rmsValues) : null;

console.log(`completed segments: ${results.length}/${segments.length}`);
if (durCv != null) {
  console.log(`duration variation (CV): ${durCv.toFixed(1)}% (text length differs — informational only)`);
}
if (rmsCv != null) {
  console.log(`loudness variation (CV): ${rmsCv.toFixed(1)}%`);
  if (rmsCv < 12) console.log("loudness: GOOD — segments are level-matched");
  else if (rmsCv < 20) console.log("loudness: FAIR — some level drift between segments");
  else console.log("loudness: POOR — noticeable volume differences (may sound like different energy/mood)");
}

console.log("");
console.log(`files saved under: ${outputDir}`);
console.log("Listen to segment_01.wav … segment_10.wav — voice timbre/tone should match.");
