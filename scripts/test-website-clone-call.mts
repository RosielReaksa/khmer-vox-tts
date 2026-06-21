/**
 * Real end-to-end voice CLONE test: HTTP POST to /api/v1/audio/clone with a
 * Bearer API key and a multipart reference audio sample, like an external
 * customer. Exercises the full route layer: auth, clone billing, rate limit,
 * generations row, and the WAV response header.
 *
 * Reads the raw key from test-output/seed-key.txt. The reference sample path
 * can be overridden with SAMPLE_PATH. Run: npx tsx scripts/test-website-clone-call.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output");

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = readFileSync(join(outputDir, "seed-key.txt"), "utf8").trim();
const samplePath = process.env.SAMPLE_PATH || "D:\\the api tts host\\outputs_10_voices\\duration_probe_15s.wav";

// ~10 seconds of Khmer text for the cloned voice to speak.
const text =
  "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងក្លូន ប្រវែងប្រហែលដប់វិនាទី។ " +
  "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាសំឡេងកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។ " +
  "អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។";

const sample = readFileSync(samplePath);
const form = new FormData();
form.set("input", text);
form.set("voice", "same speaker as the reference audio, natural Khmer speech");
form.set("model", "voxcpm2");
form.set("voice_consent", "true");
form.set("sample", new Blob([sample], { type: "audio/wav" }), basename(samplePath));

console.log("=== Website CLONE API e2e call ===");
console.log(`endpoint: POST ${baseUrl}/api/v1/audio/clone`);
console.log(`key:      ${apiKey.slice(0, 16)}... (Bearer)`);
console.log(`sample:   ${samplePath} (${(sample.length / 1024).toFixed(1)} KB)`);
console.log(`chars:    ${Array.from(text).length}`);
console.log("");

const started = Date.now();
const response = await fetch(`${baseUrl}/api/v1/audio/clone`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});
const elapsedMs = Date.now() - started;
const contentType = response.headers.get("content-type") ?? "(none)";

if (!response.ok || !contentType.includes("audio")) {
  const errText = await response.text().catch(() => "");
  console.error(`FAIL: HTTP ${response.status} (${contentType}) in ${(elapsedMs / 1000).toFixed(1)}s`);
  if (errText) console.error(errText.slice(0, 600));
  process.exit(1);
}

const bytes = Buffer.from(await response.arrayBuffer());
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "clone-voice-10s-api.wav");
writeFileSync(outputPath, bytes);

function wavReport(buf: Buffer): string {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return "not a RIFF/WAVE file";
  const riffSize = buf.readUInt32LE(4);
  let dataOffset = -1;
  for (let i = 12; i + 8 < buf.length; i++) {
    if (buf.toString("ascii", i, i + 4) === "data") { dataOffset = i; break; }
  }
  if (dataOffset < 0) return "no data chunk";
  const dataSize = buf.readUInt32LE(dataOffset + 4);
  const riffOk = riffSize === buf.length - 8;
  const dataOk = dataSize === buf.length - (dataOffset + 8);
  const sampleRate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  const seconds = dataSize / (sampleRate * channels * (bits / 8));
  return [
    `riffSize=${riffSize} (${riffOk ? "OK" : "BAD, expect " + (buf.length - 8)})`,
    `dataSize=${dataSize} (${dataOk ? "OK" : "BAD, expect " + (buf.length - (dataOffset + 8))})`,
    `${channels}ch ${sampleRate}Hz ${bits}-bit`,
    `~${seconds.toFixed(2)}s`,
  ].join(", ");
}

console.log("=== RESULT ===");
console.log(`status:            HTTP ${response.status}`);
console.log(`latency:           ${(elapsedMs / 1000).toFixed(1)}s`);
console.log(`content-type:      ${contentType}`);
console.log(`size:              ${(bytes.length / 1024).toFixed(1)} KB`);
console.log(`X-Output-Format:   ${response.headers.get("x-output-format") ?? "(none)"}`);
console.log(`X-Credits-Charged: ${response.headers.get("x-credits-charged") ?? "(none)"}`);
console.log(`X-Remaining-Tokens:${response.headers.get("x-remaining-tokens") ?? "(none)"}`);
console.log(`X-Generation-Id:   ${response.headers.get("x-generation-id") ?? "(none)"}`);
console.log(`wav header:        ${wavReport(bytes)}`);
console.log(`saved:             ${outputPath}`);
