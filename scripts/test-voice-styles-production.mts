/**
 * Production prosody + volume test: generates the SAME Khmer sentence with
 * each of the 4 voice-style presets and measures per-file loudness, tempo
 * (chars/sec proxy), and peak amplitude.
 *
 * Used to validate Step 1 (volume matching) and Step 2 (prosody presets)
 * after the prod deploy.
 *
 * Usage:
 *   $env:BASE_URL="https://voxtts.online"
 *   npx tsx scripts/test-voice-styles-production.mts
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const outputDir = join(repoRoot, "test-output", "voice-styles");

const baseUrl = (process.env.BASE_URL ?? "https://voxtts.online").replace(/\/$/, "");
const apiKeyPath = join(repoRoot, "test-output", "seed-key.txt");
const apiKey = readFileSync(apiKeyPath, "utf8").trim();

const TEXT =
  "សួស្តីអ្នកទាំងអស់គ្នា។ នេះគឺជាការធ្វើតេស្តសំឡេងភាសាខ្មែរដើម្បីវាស់ស្ទង់ភាពខុសគ្នានៃល្បឿន និងកម្រិតសំឡេងរវាងរបបនិយាយផ្សេងៗ។ យើងសង្ឃឹមថានឹងលឺភាពខុសគ្នាច្បាស់លាស់រវាងរបបទាំងបួននេះ។";

const STYLES = ["normal", "calm", "urgent", "excited"] as const;
const VOICE = "female";

interface WavInfo {
  path: string;
  bytes: number;
  durationSeconds: number | null;
  rms: number | null;
  peak: number | null;
  charsPerSecond: number | null;
}

function readWavInfo(buf: Buffer, path: string, textChars: number): WavInfo {
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
    return { path, bytes: buf.length, durationSeconds: null, rms: null, peak: null, charsPerSecond: null };
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
    path,
    bytes: buf.length,
    durationSeconds: duration,
    rms,
    peak,
    charsPerSecond: duration > 0 ? textChars / duration : null,
  };
}

async function generateOne(style: typeof STYLES[number]): Promise<WavInfo> {
  const url = `${baseUrl}/api/v1/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: TEXT,
      voice: VOICE,
      voice_style: style,
      response_format: "wav",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`generate(${style}) failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = join(outputDir, `${VOICE}-${style}.wav`);
  writeFileSync(out, buf);
  return readWavInfo(buf, out, Array.from(TEXT).length);
}

console.log("=== Voice Style prosody + volume test ===");
console.log(`API:      ${baseUrl}`);
console.log(`voice:    ${VOICE}`);
console.log(`text:     ${Array.from(TEXT).length} chars (single sentence)`);
console.log(`styles:   ${STYLES.join(", ")}`);
console.log(`output:   ${outputDir}`);
console.log("");

mkdirSync(outputDir, { recursive: true });

const results: WavInfo[] = [];
for (const style of STYLES) {
  console.log(`-> generating style="${style}" ...`);
  try {
    const info = await generateOne(style);
    results.push(info);
    console.log(
      `   saved ${info.path.split(/[\\/]/).pop()}  ` +
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
const cv = (xs: number[]) => {
  const m = mean(xs);
  return m === 0 ? 0 : (stddev(xs) / m) * 100;
};

console.log("");
console.log("=== Loudness consistency (Step 1: volume matching) ===");
const rms = results.map((r) => r.rms ?? 0);
console.log(`  RMS  mean=${mean(rms).toFixed(0)}  stddev=${stddev(rms).toFixed(0)}  CV=${cv(rms).toFixed(1)}%  (target < 5%)`);

const peak = results.map((r) => r.peak ?? 0);
console.log(`  Peak mean=${mean(peak).toFixed(0)}  stddev=${stddev(peak).toFixed(0)}  CV=${cv(peak).toFixed(1)}%`);

console.log("");
console.log("=== Prosody delta (Step 2: voice styles) ===");
const cps = results.map((r) => r.charsPerSecond ?? 0);
const baselineCps = results.find((r) => r.path.endsWith(`${VOICE}-normal.wav`))?.charsPerSecond ?? 0;
for (const r of results) {
  const c = r.charsPerSecond ?? 0;
  const delta = baselineCps > 0 ? ((c - baselineCps) / baselineCps) * 100 : 0;
  const style = r.path.split(/[\\/]/).pop()?.replace(".wav", "").replace(`${VOICE}-`, "") ?? "?";
  console.log(`  ${style.padEnd(8)} cps=${c.toFixed(1)}  delta_vs_normal=${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`);
}

console.log("");
console.log("=== Verdict ===");
const rmsCv = cv(rms);
if (rmsCv < 3) console.log(`  PASS: RMS loudness CV ${rmsCv.toFixed(1)}% — within batch volume is steady.`);
else if (rmsCv < 5) console.log(`  WARN: RMS loudness CV ${rmsCv.toFixed(1)}% — small drift but acceptable.`);
else console.log(`  FAIL: RMS loudness CV ${rmsCv.toFixed(1)}% — voices sound uneven in volume.`);

const cpsSorted = [...cps].sort((a, b) => a - b);
const cpsSpread = cpsSorted[cpsSorted.length - 1] - cpsSorted[0];
if (cpsSpread > 1.5) console.log(`  PASS: cps spread ${cpsSpread.toFixed(1)} — prosody styles are audible.`);
else if (cpsSpread > 0.5) console.log(`  WARN: cps spread ${cpsSpread.toFixed(1)} — prosody delta is subtle.`);
else console.log(`  FAIL: cps spread ${cpsSpread.toFixed(1)} — styles sound the same.`);
