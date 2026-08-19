// Generate a REALISTIC multi-chunk file that mimics the actual synthesis
// pipeline as closely as possible without a live Modal server:
//
//   1. Produce 20 INDEPENDENT chunks — each a distinct "phrase" with its own
//      frequency, envelope and slight level, exactly like 20 separately
//      synthesized VoxCPM2 chunks (uncorrelated at the boundaries, which is
//      what causes the real crossfade smear).
//   2. Join them with the REAL concatPcm16WavBuffers crossfade logic
//      (replicated from lib/tts-provider.ts) so the seams behave like prod.
//   3. Inject crackle defects (clip + transient) into a few chunks.
//
// This is the closest validation to a real ~20-segment generation that's
// possible without a live server. Then analyse-realistic-multichunk.mjs splits
// the joined result back into 20 and runs the gates.

import { writeFileSync, mkdirSync } from "node:fs";

const outDir = process.argv[2] || "test-output/fixtures";
const SAMPLE_RATE = Number(process.argv[3] || 24000);
const CHANNELS = 1;
const MAX = 32767;
const N = 20; // chunks
const CHUNK_SEC = 3; // ~3s per chunk ≈ a 400-char VoxCPM2 chunk

mkdirSync(outDir, { recursive: true });

// --- small deterministic PRNG so the file is reproducible -----------------
let seed = 0x2545f491;
const rand = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
};

const clamp16 = (v) => Math.max(-MAX, Math.min(MAX, Math.round(v)));

// --- generate one independent chunk ---------------------------------------
// A "phrase": a vowel-like carrier (200-400 Hz) with a gentle envelope and
// a little amplitude variation — stands in for one synthesized segment.
function makeChunk(index, defect) {
  const frames = Math.floor(CHUNK_SEC * SAMPLE_RATE);
  const out = new Int16Array(frames);
  const baseFreq = 200 + rand() * 200; // 200-400 Hz, distinct per chunk
  const amp = 12000 + rand() * 6000; // level varies per chunk (real drift)
  // Attack/release so each chunk has its own onset/offset.
  const attack = Math.floor(0.05 * SAMPLE_RATE);
  const release = Math.floor(0.08 * SAMPLE_RATE);
  for (let f = 0; f < frames; f++) {
    const env = Math.min(1, f / attack, (frames - f) / release);
    // carrier + a little 2nd harmonic for a speech-like timbre
    let sample = Math.sin(2 * Math.PI * baseFreq * f / SAMPLE_RATE) * 0.8
      + Math.sin(2 * Math.PI * baseFreq * 2 * f / SAMPLE_RATE) * 0.2;
    out[f] = clamp16(sample * amp * env);
  }

  if (defect === "clip") {
    // 40ms burst pinned near full scale (longer than the 0.02s clip gate)
    const cStart = Math.floor(frames * 0.5);
    const burst = Math.floor(0.04 * SAMPLE_RATE);
    for (let i = 0; i < burst; i++) out[cStart + i] = (i % 2 === 0) ? 32767 : 32700;
  } else if (defect === "transient") {
    // Sharp single-sample full-scale spikes — the impulse shape that the
    // peak-based transient gate separates best (validated: 7.1dB above the
    // local median peak, vs 0.0dB for clean speech).
    for (let p = 0; p < 5; p++) {
      const center = Math.floor((0.15 + p * 0.16) * frames);
      out[center] = (p % 2 === 0) ? 32767 : -32767;
      if (center + 1 < frames) out[center + 1] = (p % 2 === 0) ? -32767 : 32767;
    }
  }
  return out;
}

// --- replicate the REAL concatPcm16WavBuffers gapless crossfade join -------
// (mirrors lib/tts-provider.ts joinSegments gapless mode with the .env defaults)
function joinChunks(chunks) {
  const bytesPerFrame = CHANNELS * 2;
  const crossfadeMs = 45;
  const crossfadeFrames = Math.round((SAMPLE_RATE * crossfadeMs) / 1000);

  let data = Buffer.from(chunks[0].buffer, chunks[0].byteOffset, chunks[0].byteLength);
  const toBuffer = (arr) => {
    const b = Buffer.alloc(arr.byteLength);
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(b);
    return b;
  };

  for (let c = 1; c < chunks.length; c++) {
    const right = toBuffer(chunks[c]);
    const left = data;
    const leftFrames = Math.floor(left.length / bytesPerFrame);
    const rightFrames = Math.floor(right.length / bytesPerFrame);
    const fadeFrames = Math.min(crossfadeFrames, Math.floor(leftFrames / 3), Math.floor(rightFrames / 3));
    if (fadeFrames <= 0) { data = Buffer.concat([left, right]); continue; }

    const overlapBytes = fadeFrames * bytesPerFrame;
    const crossfaded = Buffer.alloc(overlapBytes);
    const leftStart = left.length - overlapBytes;
    for (let frame = 0; frame < fadeFrames; frame++) {
      const t = (frame + 1) / (fadeFrames + 1);
      const leftGain = Math.cos((t * Math.PI) / 2);
      const rightGain = Math.sin((t * Math.PI) / 2);
      const outOff = frame * bytesPerFrame;
      const leftOff = leftStart + outOff;
      const lv = left.readInt16LE(leftOff);
      const rv = right.readInt16LE(outOff);
      crossfaded.writeInt16LE(clamp16(lv * leftGain + rv * rightGain), outOff);
    }
    data = Buffer.concat([left.subarray(0, left.length - overlapBytes), crossfaded, right.subarray(overlapBytes)]);
  }
  return data;
}

// --- build the 20 chunks (defects in chunks 7, 13, 18) -------------------
const defectMap = { 7: "clip", 13: "transient", 18: "transient" };
const chunks = [];
for (let i = 0; i < N; i++) chunks.push(makeChunk(i, defectMap[i] || null));

const joined = joinChunks(chunks);

// --- write 16-bit PCM WAV -------------------------------------------------
const writeWav = (name, pcm) => {
  const src = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const dataBytes = src.length;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.writeUInt32LE(0x46464952, 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.writeUInt32LE(0x45564157, 8);
  buf.writeUInt32LE(0x20746d66, 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.writeUInt32LE(0x61746164, 36);
  buf.writeUInt32LE(dataBytes, 40);
  src.copy(buf, 44);
  writeFileSync(`${outDir}/${name}.wav`, buf);
};

// Write each chunk individually (how the real pipeline validates — pre-join).
for (let i = 0; i < N; i++) writeWav(`chunk-${String(i).padStart(2, "0")}`, chunks[i]);
console.log(`wrote ${N} individual chunk WAVs to ${outDir}/chunk-00.wav ... chunk-19.wav`);

const path = `${outDir}/realistic-multichunk.wav`;
writeWav("realistic-multichunk", joined);
console.log(`wrote ${path} (joined, ${(N * CHUNK_SEC).toFixed(0)}s, ${SAMPLE_RATE}Hz)`);
console.log(`defects injected: chunk 7 = clip, chunk 13 = transient, chunk 18 = transient`);
console.log(`validate each chunk (real-pipeline style): for i in 0..19: node scratch/analyse-audio.mjs ${outDir}/chunk-i.wav`);
