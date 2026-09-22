/**
 * Production tempo test via batch API (avoids Cloudflare 524 on long speech).
 * Generates one male line, measures WAV duration.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output", "tempo-test");

const baseUrl = (process.env.BASE_URL || "https://voxtts.online").replace(/\/$/, "");
const apiKey = readFileSync(join(repoRoot, "test-output", "seed-key.txt"), "utf8").trim();
const label = (process.env.TEST_LABEL || "run").replace(/[^\w-]/g, "");

const text =
  "សួស្តី! នេះគឺជាការសាកល្បងល្បឿននិយាយសំឡេងបុរសខ្មែរ។ " +
  "យើងពិនិត្យថាតើការកំណត់ល្បឿនដំណើរការលើប្រព័ន្ធឬអត់។ " +
  "បច្ចេកវិទ្យាសំឡេងគួរតែដំណើរការយ៉ាងត្រឹមត្រូវ។ " +
  "អរគុណសម្រាប់ការសាកល្បងនេះ។";

function wavDurationSeconds(buf) {
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollJob(jobId) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    const status = data.job?.status;
    if (status === "completed" || status === "partial" || status === "failed") return data;
    await sleep(3000);
  }
  throw new Error("job timed out");
}

console.log("=== Tempo test (batch, 1 line) ===");
console.log(`API:   ${baseUrl}`);
console.log(`label: ${label}`);
console.log("");

const createRes = await fetch(`${baseUrl}/api/v1/audio/batch`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    input: [text],
    voice: "male",
    model: "voxcpm2",
    title: `tempo-test-${label}`,
  }),
});
const createBody = await createRes.json();
if (!createRes.ok || !createBody.job?.id) {
  console.error("FAIL create:", createRes.status, createBody);
  process.exit(1);
}

const jobId = createBody.job.id;
console.log(`job: ${jobId}`);
const polled = await pollJob(jobId);
console.log(`status: ${polled.job?.status}`);

const zipRes = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${jobId}/download`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!zipRes.ok) {
  console.error("FAIL download:", zipRes.status);
  process.exit(1);
}

const labelDir = join(outputDir, label);
mkdirSync(labelDir, { recursive: true });
const zipPath = join(labelDir, `${jobId}.zip`);
writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));
execSync(
  `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${labelDir.replace(/'/g, "''")}' -Force"`,
  { stdio: "inherit" },
);

const wav = readdirSync(labelDir).find((f) => f.endsWith(".wav"));
if (!wav) {
  console.error("no wav in zip");
  process.exit(1);
}

const bytes = readFileSync(join(labelDir, wav));
const duration = wavDurationSeconds(bytes);
const outPath = join(labelDir, `${label}-male.wav`);
writeFileSync(outPath, bytes);

const result = {
  label,
  jobId,
  jobStatus: polled.job?.status,
  wavFile: wav,
  bytes: bytes.length,
  durationSec: duration != null ? +duration.toFixed(3) : null,
  path: outPath,
};

console.log(JSON.stringify(result, null, 2));
writeFileSync(join(outputDir, `${label}-result.json`), JSON.stringify(result, null, 2));
