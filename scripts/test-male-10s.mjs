// Local one-shot test: generate ~10s of male Khmer voice as WAV.
//
// Reads TTS_UPSTREAM_URL + TTS_UPSTREAM_TOKEN from .env.backup so we never
// echo the secret value, and saves the result to test-output/male-voice-10s.wav.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function readEnvBackup() {
  const raw = readFileSync(join(repoRoot, ".env.backup"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
}

const env = readEnvBackup();
const url = env.TTS_UPSTREAM_URL;
const token = env.TTS_UPSTREAM_TOKEN;
if (!url || !token) {
  console.error("FAIL: TTS_UPSTREAM_URL or TTS_UPSTREAM_TOKEN missing in .env.backup");
  process.exit(1);
}

// ~140 Khmer chars across 3 sentences. Targets roughly 10 seconds of speech.
const text =
  "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងបុរសខ្មែរ ប្រវែងប្រហែលដប់វិនាទី។ " +
  "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាសំឡេងកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។ " +
  "អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។";

const payload = {
  model: "voxcpm2",
  input: text,
  voice: "male",
  response_format: "wav",
};

const outputDir = join(repoRoot, "test-output");
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "male-voice-10s.wav");

console.log(`Endpoint: ${new URL(url).host}`);
console.log(`Voice:    male (preset)`);
console.log(`Format:   wav`);
console.log(`Text:     ${Array.from(text).length} chars (${text.length} UTF-16 units)`);
console.log("");
console.log("Calling Modal...");

const started = Date.now();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 180_000);

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
} catch (error) {
  clearTimeout(timeout);
  console.error(`FAIL: request errored: ${error.message ?? error}`);
  process.exit(1);
}
clearTimeout(timeout);

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const contentType = response.headers.get("content-type") ?? "(unknown)";

if (!response.ok) {
  const text = await response.text().catch(() => "");
  console.error(`FAIL: HTTP ${response.status} (${contentType}) in ${elapsed}s`);
  if (text) console.error(text.slice(0, 500));
  process.exit(1);
}

const buffer = Buffer.from(await response.arrayBuffer());
writeFileSync(outputPath, buffer);

// Estimate duration. PCM-16 mono at the canonical 24 kHz used by VoxCPM2 = 48000 B/s.
function estimateDurationSeconds(bytes) {
  if (bytes.length < 44) return null;
  const isWav = bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
                bytes.subarray(8, 12).toString("ascii") === "WAVE";
  if (!isWav) return null;
  // Read fmt chunk: scan for "fmt " then read 16-bit channels, 32-bit sample rate, 16-bit bits per sample.
  for (let i = 12; i + 8 < bytes.length; i++) {
    if (bytes.subarray(i, i + 4).toString("ascii") === "fmt ") {
      const channels = bytes.readUInt16LE(i + 10);
      const sampleRate = bytes.readUInt32LE(i + 12);
      const bitsPerSample = bytes.readUInt16LE(i + 22);
      // Find data chunk
      for (let j = i + 8; j + 8 < bytes.length; j++) {
        if (bytes.subarray(j, j + 4).toString("ascii") === "data") {
          const dataSize = bytes.readUInt32LE(j + 4);
          const bytesPerSecond = (sampleRate * channels * bitsPerSample) / 8;
          return bytesPerSecond > 0 ? dataSize / bytesPerSecond : null;
        }
      }
      break;
    }
  }
  return null;
}

const seconds = estimateDurationSeconds(buffer);

console.log("");
console.log("=== RESULT ===");
console.log(`Status:   HTTP ${response.status}`);
console.log(`Latency:  ${elapsed}s`);
console.log(`Type:     ${contentType}`);
console.log(`Size:     ${(buffer.length / 1024).toFixed(1)} KB (${buffer.length.toLocaleString()} bytes)`);
console.log(`Duration: ${seconds === null ? "(could not parse WAV)" : `${seconds.toFixed(2)}s`}`);
console.log(`Saved:    ${outputPath}`);
