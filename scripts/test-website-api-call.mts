/**
 * Real end-to-end test: HTTP POST to the website API /api/v1/audio/speech with
 * a Bearer API key, exactly like an external customer would. This exercises the
 * FULL route layer the in-process provider test skips: API-key auth, token
 * billing, rate limiting, the generations DB row, and the response headers.
 *
 * Reads the raw key from test-output/seed-key.txt (written by
 * scripts/seed-paid-api-user.mts). Run: npx tsx scripts/test-website-api-call.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output");

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = readFileSync(join(outputDir, "seed-key.txt"), "utf8").trim();
const voice = (process.env.VOICE || "male").trim().toLowerCase() === "female" ? "female" : "male";

// ~10 seconds of male Khmer voice (same text as the provider test).
const text =
  "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងបុរសខ្មែរ ប្រវែងប្រហែលដប់វិនាទី។ " +
  "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាសំឡេងកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។ " +
  "អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។";

console.log("=== Website API e2e call ===");
console.log(`endpoint: POST ${baseUrl}/api/v1/audio/speech`);
console.log(`key:      ${apiKey.slice(0, 16)}... (Bearer)`);
console.log(`voice:    ${voice}`);
console.log(`chars:    ${Array.from(text).length}`);
console.log("");

const started = Date.now();
const response = await fetch(`${baseUrl}/api/v1/audio/speech`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ input: text, voice, model: "voxcpm2" }),
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
const outputPath = join(outputDir, `${voice}-voice-10s-api.wav`);
writeFileSync(outputPath, bytes);

// Validate WAV header sizes (the bug fixed earlier: placeholder 0xFFFFFFFF).
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
