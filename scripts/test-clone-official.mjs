#!/usr/bin/env node
/**
 * Test voice clone with official VoxCPM2 settings.
 * Calls Modal endpoint directly to verify the fix.
 *
 * Usage: node scripts/test-clone-official.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Load env from .env.backup
const envPath = join(process.cwd(), ".env.backup");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    let key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// Parse upstream pool
let endpoints = [];
const poolStr = process.env.TTS_UPSTREAM_POOL?.trim();
if (poolStr) {
  try {
    const parsed = JSON.parse(poolStr);
    if (Array.isArray(parsed)) {
      endpoints = parsed.map((item) => ({
        url: String(item.url ?? item.endpoint ?? "").trim(),
        token: String(item.token ?? item.key ?? item.apiKey ?? "").trim(),
        label: String(item.label ?? item.name ?? "").trim(),
      })).filter((ep) => ep.url);
    }
  } catch (e) {
    console.error("Failed to parse TTS_UPSTREAM_POOL:", e.message);
  }
}

// Fallback to single endpoint
if (endpoints.length === 0 && process.env.TTS_UPSTREAM_URL) {
  endpoints.push({
    url: process.env.TTS_UPSTREAM_URL.trim(),
    token: process.env.TTS_UPSTREAM_TOKEN?.trim() || "",
    label: "Default",
  });
}

if (endpoints.length === 0) {
  console.error("No TTS upstream endpoints configured.");
  process.exit(1);
}

console.log(`Found ${endpoints.length} upstream endpoint(s)`);

// Reference audio
const refPath = process.argv[2] || "D:\\the api tts host\\outputs_10_voices\\duration_probe_15s_d.wav";
console.log(`Reference audio: ${refPath}`);

let refBytes;
try {
  refBytes = readFileSync(refPath);
  console.log(`Reference size: ${(refBytes.length / 1024).toFixed(1)} KB`);
} catch (e) {
  console.error(`Cannot read reference file: ${e.message}`);
  process.exit(1);
}

// Convert reference to mono 16kHz s16 WAV using ffmpeg
console.log("\n--- Step 1: Convert reference to mono 16kHz WAV ---");
const { spawnSync } = await import("child_process");

function runFfmpegSync(args, input) {
  const ffmpegPath = process.platform === "win32"
    ? "node_modules/ffmpeg-static/ffmpeg.exe"
    : "ffmpeg";
  const result = spawnSync(ffmpegPath, args, {
    input,
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed: ${result.stderr?.toString().slice(0, 300)}`);
  }
  return result.stdout;
}

// NO FILTERING - send clean reference as-is (official VoxCPM2 approach)
const convertedRef = runFfmpegSync(
  [
    "-hide_banner", "-loglevel", "error",
    "-i", "pipe:0",
    // No highpass, no lowpass, no loudnorm - just format conversion
    "-ac", "1", "-ar", "16000", "-sample_fmt", "s16",
    "-f", "wav", "pipe:1",
  ],
  refBytes,
);
console.log(`Converted reference: ${(convertedRef.length / 1024).toFixed(1)} KB`);
const refBase64 = convertedRef.toString("base64");

// Test text - ~20 seconds of Khmer speech
const testText = "សួស្តី នេះគឺជាការសាកល្បងសំឡេងខ្មែរពី VoxCPM2។ ខ្ញុំសូមណែនាំខ្លួន ខ្ញុំជាអ្នកអភិវឌ្ឍន៍កម្មវិធីដែលមានចំណាប់អារម្មណ៍លើបច្ចេកវិទ្យាសំឡេង។ ថ្ងៃនេះខ្ញុំចង់សាកល្បងមុខងារថតសំឡេងរបស់ VoxCPM2។";

const charCount = [...testText].length;
const estimatedSeconds = Math.ceil(charCount / 13);
console.log(`\nTest text: ${charCount} chars, ~${estimatedSeconds}s estimated`);

// OFFICIAL VoxCPM2 settings
const payload = {
  model: "voxcpm2",
  input: testText,
  voice: "same speaker as the reference audio, natural clear Khmer speech",
  response_format: "wav",
  ref_audio_wav_base64: refBase64,
  ref_audio_wav_format: "wav",
  temperature: 1.0,       // OFFICIAL default (was 0.55/0.45)
  cfg_value: 2.0,          // OFFICIAL default (unchanged)
  max_generate_length: 2000, // OFFICIAL default
};

console.log("\n--- Step 2: Call VoxCPM2 with OFFICIAL settings ---");
console.log(`  temperature: ${payload.temperature} (official default)`);
console.log(`  cfg_value: ${payload.cfg_value} (official default)`);
console.log(`  voice: "${payload.voice}"`);
console.log(`  ref_audio: clean (no filtering)`);

const endpoint = endpoints[0];
console.log(`  endpoint: ${endpoint.label || endpoint.url}`);

const startTime = Date.now();

try {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(endpoint.token ? { Authorization: `Bearer ${endpoint.token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nResponse: ${response.status} in ${elapsed}s`);

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Error: ${errText.slice(0, 500)}`);
    process.exit(1);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  console.log(`Audio size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

  // Save WAV
  const outWav = join(process.cwd(), "test-clone-official-output.wav");
  writeFileSync(outWav, audioBuffer);
  console.log(`Saved WAV: ${outWav}`);

  // Convert to MP3 for easy listening
  const mp3Buffer = runFfmpegSync(
    [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-b:a", "160k",
      "-f", "mp3", "pipe:1",
    ],
    audioBuffer,
  );
  const outMp3 = join(process.cwd(), "test-clone-official-output.mp3");
  writeFileSync(outMp3, mp3Buffer);
  console.log(`Saved MP3: ${outMp3} (${(mp3Buffer.length / 1024).toFixed(1)} KB)`);

  // Analyze quality with ffprobe/astats
  console.log("\n--- Step 3: Audio quality analysis ---");
  const statsOut = runFfmpegSync(
    [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-af", "astats=metadata=1:reset=0",
      "-f", "null", "-",
    ],
    mp3Buffer,
  );
  const statsText = statsOut.toString();

  // Extract key metrics
  const rmsMatch = statsText.match(/RMS level dB:\s*([-\d.]+)/);
  const peakMatch = statsText.match(/Peak level dB:\s*([-\d.]+)/);
  const flatMatch = statsText.match(/Flat factor:\s*([\d.]+)/);
  const peakCountMatch = statsText.match(/Peak count:\s*([\d.]+)/);

  if (rmsMatch) console.log(`RMS level: ${rmsMatch[1]} dB`);
  if (peakMatch) console.log(`Peak level: ${peakMatch[1]} dB`);
  if (flatMatch) console.log(`Flat factor: ${flatMatch[1]}`);
  if (peakCountMatch) console.log(`Peak count: ${peakCountMatch[1]}`);

  // Quick duration check
  const durationOut = runFfmpegSync(
    [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-af", "astats=metadata=1:reset=0:measure_perchannel=none",
      "-f", "null", "-",
    ],
    mp3Buffer,
  );
  const durationText = durationOut.toString();
  const durationMatch = durationText.match(/Number of samples:\s*([\d.]+)/);
  if (durationMatch) {
    const samples = parseFloat(durationMatch[1]);
    // MP3 output is 24kHz after our pipeline
    const durationSec = samples / 24000;
    console.log(`Duration: ~${durationSec.toFixed(1)}s`);
  }

  console.log("\n✅ Test complete. Compare the output MP3 with previous generations.");
  console.log("   The new settings should produce cleaner, more natural voice output.");

} catch (e) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`\nFailed after ${elapsed}s: ${e.message}`);
  process.exit(1);
}
