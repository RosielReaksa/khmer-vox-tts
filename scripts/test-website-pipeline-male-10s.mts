/**
 * Local website-pipeline test: generate ~10s of male Khmer voice through the
 * SAME code path the website uses (lib/tts-provider.ts → synthesizeWithUpstream).
 *
 * What this exercises that the previous direct-Modal test did NOT:
 *   - text sanitization (prepareTextForSpeech)
 *   - chunk splitting + parallel chunks against the configured upstream pool
 *   - per-chunk silence/buzz quality gate + retries
 *   - concatPcm16WavBuffers (crossfade + quiet-edge pause-pad + declick)
 *   - capLongPauses, reduceOutputNoise, normalizeOutputLoudness, applyOutputTempo
 *   - delivery-level final-quality retry
 *
 * What it intentionally skips (these belong to the route layer, not the
 * provider): API-key auth, rate limit, token billing, generations DB row,
 * Spaces upload.
 *
 * Run:  npx tsx scripts/test-website-pipeline-male-10s.mts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Load .env.backup BEFORE importing the website code so the provider sees the
// Modal pool/token env at import time.
function loadEnvBackup() {
  const raw = readFileSync(join(repoRoot, ".env.backup"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvBackup();

// Mirror the WAV-switch contract: tell the upstream we want WAV. Even if the
// live Modal endpoint still defaults to MP3, the website normalizes either way.
process.env.TTS_UPSTREAM_RESPONSE_FORMAT ||= "wav";

// Now pull in the website's provider. The static import would resolve before
// the env load above, so use a dynamic import.
const tts = await import("../lib/tts-provider");

// Roughly 10 seconds of natural Khmer male voice. Three short sentences
// (~140 chars total) keep the request inside one chunk so we can also see the
// single-chunk path through the WAV merge + master.
const text =
  "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងបុរសខ្មែរ ប្រវែងប្រហែលដប់វិនាទី។ " +
  "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាសំឡេងកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។ " +
  "អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។";

console.log("=== Website pipeline test ===");
console.log(`mode:    tts (preset)`);
console.log(`voice:   male`);
console.log(`format:  wav (TTS_UPSTREAM_RESPONSE_FORMAT=${process.env.TTS_UPSTREAM_RESPONSE_FORMAT})`);
console.log(`chars:   ${Array.from(text).length}`);
console.log("");

const started = Date.now();
let result;
try {
  result = await tts.synthesizeWithUpstream({
    mode: "tts",
    text,
    voice: "male",
    model: "voxcpm2",
  });
} catch (error) {
  const err = error as { message?: string; status?: number; stack?: string };
  console.error("");
  console.error(`FAIL: synthesizeWithUpstream threw: ${err?.message ?? String(error)}`);
  if (err?.status) console.error(`status: ${err.status}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
}
const elapsedMs = Date.now() - started;

const outputDir = join(repoRoot, "test-output");
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "male-voice-10s-website.wav");
writeFileSync(outputPath, Buffer.from(result.audioBytes));

// Local WAV duration parser so we don't need ffprobe.
function estimateWavSeconds(bytes: Uint8Array): number | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 44) return null;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("ascii") !== "WAVE") return null;
  for (let i = 12; i + 8 < buf.length; i++) {
    if (buf.subarray(i, i + 4).toString("ascii") === "fmt ") {
      const channels = buf.readUInt16LE(i + 10);
      const sampleRate = buf.readUInt32LE(i + 12);
      const bitsPerSample = buf.readUInt16LE(i + 22);
      for (let j = i + 8; j + 8 < buf.length; j++) {
        if (buf.subarray(j, j + 4).toString("ascii") === "data") {
          const dataSize = buf.readUInt32LE(j + 4);
          const bps = (sampleRate * channels * bitsPerSample) / 8;
          return bps > 0 ? dataSize / bps : null;
        }
      }
      break;
    }
  }
  return null;
}

const seconds = estimateWavSeconds(result.audioBytes);

console.log("=== RESULT ===");
console.log(`status:        ok`);
console.log(`latency:       ${(elapsedMs / 1000).toFixed(1)}s wall (includes any quality retries)`);
console.log(`content-type:  ${result.contentType}`);
console.log(`size:          ${(result.audioBytes.byteLength / 1024).toFixed(1)} KB`);
console.log(`outputSeconds: ${result.outputSeconds === null ? "(null)" : result.outputSeconds.toFixed(2)}s (provider-reported)`);
console.log(`wav duration:  ${seconds === null ? "(could not parse)" : seconds.toFixed(2)}s (parsed locally)`);
console.log(`upstream req:  ${result.upstreamRequestId || "(none)"}`);
console.log(`saved:         ${outputPath}`);
