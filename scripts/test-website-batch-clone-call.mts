/**
 * Real end-to-end BATCH voice-clone test (business-style): HTTP POST to
 * /api/v1/audio/batch/clone with a Bearer API key, a reference sample, and N
 * lines of text — all generated against the SAME cloned voice. Then polls the
 * job status until done and downloads the result zip.
 *
 * Reads the raw key from test-output/seed-key.txt. Configure item count with
 * ITEMS (default 10) and reference with SAMPLE_PATH.
 * Run: npx tsx scripts/test-website-batch-clone-call.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output");

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = readFileSync(join(outputDir, "seed-key.txt"), "utf8").trim();
const samplePath = process.env.SAMPLE_PATH || "D:\\the api tts host\\outputs_10_voices\\duration_probe_15s.wav";
const itemCount = Math.max(1, Math.min(20, Number(process.env.ITEMS || "10")));

// Distinct short Khmer lines so each item is clearly its own generation.
const baseLines = [
  "សួស្តី នេះជាបន្ទាត់ទីមួយនៃការសាកល្បងជាបាច់។",
  "បច្ចេកវិទ្យាសំឡេងខ្មែរកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។",
  "យើងកំពុងសាកល្បងការបង្កើតសំឡេងច្រើនក្នុងពេលតែមួយ។",
  "សូមអរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។",
  "ការក្លូនសំឡេងគួរតែដូចអ្នកនិយាយដើមឱ្យបានច្រើនបំផុត។",
  "នេះជាការសាកល្បងគុណភាពសំឡេងសម្រាប់អាជីវកម្ម។",
  "រាល់បន្ទាត់ត្រូវបានបង្កើតដោយប្រើសំឡេងក្លូនតែមួយ។",
  "ប្រព័ន្ធគួរតែដំណើរការបានយ៉ាងរលូននិងលឿន។",
  "ការផលិតសំឡេងជាបាច់ជួយសន្សំសំចៃពេលវេលា។",
  "នេះជាបន្ទាត់ចុងក្រោយនៃការសាកល្បងជាបាច់នេះ។",
];
const items = Array.from({ length: itemCount }, (_, i) => ({
  external_id: `line-${i + 1}`,
  text: baseLines[i % baseLines.length],
}));

const sample = readFileSync(samplePath);
const sampleBase64 = sample.toString("base64");

console.log("=== Website BATCH CLONE API e2e call ===");
console.log(`endpoint: POST ${baseUrl}/api/v1/audio/batch/clone`);
console.log(`key:      ${apiKey.slice(0, 16)}... (Bearer)`);
console.log(`sample:   ${samplePath} (${(sample.length / 1024).toFixed(1)} KB)`);
console.log(`items:    ${itemCount} lines, same cloned voice`);
console.log("");

type BatchJob = {
  status: string;
  completed_items: number;
  total_items: number;
  failed_items: number;
  credits_charged?: number;
  output_seconds?: number | null;
};

type BatchJobItem = {
  index: number;
  external_id?: string;
  status: string;
  output_seconds?: number;
  credits_charged?: number;
  has_audio?: boolean;
  error?: string;
};

async function readJson<T = Record<string, unknown>>(
  res: Response,
): Promise<{ text: string; json: T | null }> {
  const text = await res.text();
  try { return { text, json: JSON.parse(text) as T }; } catch { return { text, json: null }; }
}

const submitStarted = Date.now();
const submit = await fetch(`${baseUrl}/api/v1/audio/batch/clone`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Batch clone e2e test",
    items,
    voice: "same speaker as the reference audio, natural Khmer speech",
    model: "voxcpm2",
    voice_consent: true,
    reference_audio_base64: sampleBase64,
    reference_audio_mime_type: "audio/wav",
  }),
});
const submitted = await readJson<{
  job_id?: string;
  job?: { total_items?: number; credits_estimated?: number };
}>(submit);
if (submit.status !== 202 || !submitted.json?.job_id) {
  console.error(`FAIL: submit HTTP ${submit.status}: ${submitted.text.slice(0, 600)}`);
  process.exit(1);
}
const jobId: string = submitted.json.job_id;
console.log(`queued:        job ${jobId}`);
console.log(`total_items:   ${submitted.json.job?.total_items}`);
console.log(`credits_est:   ${submitted.json.job?.credits_estimated}`);
console.log("polling status...");

let job: BatchJob | null = null;
let itemsOut: BatchJobItem[] = [];
const pollDeadline = Date.now() + 10 * 60 * 1000; // up to 10 min
while (Date.now() < pollDeadline) {
  await new Promise((r) => setTimeout(r, 4000));
  const status = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await readJson<{ job?: BatchJob; items?: BatchJobItem[] }>(status);
  if (status.status !== 200 || !body.json?.job) {
    console.error(`FAIL: status HTTP ${status.status}: ${body.text.slice(0, 400)}`);
    process.exit(1);
  }
  job = body.json.job;
  itemsOut = body.json.items ?? [];
  process.stdout.write(`  status=${job.status} done=${job.completed_items}/${job.total_items} failed=${job.failed_items}\n`);
  if (["completed", "partial", "failed", "needs_review"].includes(job.status)) break;
}

const elapsed = ((Date.now() - submitStarted) / 1000).toFixed(1);
if (!job) {
  console.error("FAIL: job never returned a status before the deadline.");
  process.exit(1);
}
console.log("");
console.log("=== JOB RESULT ===");
console.log(`status:          ${job.status}`);
console.log(`elapsed:         ${elapsed}s`);
console.log(`completed/total: ${job.completed_items}/${job.total_items}`);
console.log(`failed:          ${job.failed_items}`);
console.log(`credits_charged: ${job.credits_charged}`);
console.log(`output_seconds:  ${job.output_seconds ?? "(none)"}`);
console.log("");
console.log("=== PER-ITEM ===");
for (const it of itemsOut) {
  console.log(
    `  #${String(it.index + 1).padStart(2, "0")} ${it.external_id ?? ""} | ${it.status} | ${it.output_seconds ?? "?"}s | ${it.credits_charged ?? 0} cr | audio=${it.has_audio}${it.error ? " | " + it.error : ""}`,
  );
}

// Download the result zip.
const dl = await fetch(`${baseUrl}/api/v1/audio/batch/jobs/${encodeURIComponent(jobId)}/download`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (dl.status === 200 && dl.headers.get("content-type")?.includes("zip")) {
  const zipBytes = Buffer.from(await dl.arrayBuffer());
  mkdirSync(outputDir, { recursive: true });
  const zipPath = join(outputDir, "batch-clone-api.zip");
  writeFileSync(zipPath, zipBytes);
  // Count local file entries (PK\x03\x04 signatures).
  let entries = 0;
  for (let i = 0; i + 4 <= zipBytes.length; i++) {
    if (zipBytes[i] === 0x50 && zipBytes[i + 1] === 0x4b && zipBytes[i + 2] === 0x03 && zipBytes[i + 3] === 0x04) entries++;
  }
  console.log("");
  console.log(`zip:             ${(zipBytes.length / 1024).toFixed(1)} KB, ${entries} files`);
  console.log(`saved:           ${zipPath}`);
} else {
  const t = await dl.text().catch(() => "");
  console.log("");
  console.log(`zip download:    HTTP ${dl.status} ${t.slice(0, 200)}`);
}
