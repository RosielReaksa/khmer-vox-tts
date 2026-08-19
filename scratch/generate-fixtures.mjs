// Synthetic 16-bit PCM WAV fixture generator for validating the Phase 1-3
// audio detectors. Each fixture embeds a KNOWN artifact so the analyser
// (analyse-audio.mjs) can be checked against ground truth:
//   clean.wav         -> steady tone + gentle envelope -> should PASS all gates
//   clipped.wav       -> a burst of samples pinned at full scale -> clip gate
//   transient.wav     -> short broadband energy pops        -> transient gate
//   segments20.wav    -> 20 chunks, a few with injected defects (multi-seg run)
//
// Usage:
//   node scratch/generate-fixtures.mjs [outDir] [sampleRate]
//   defaults: outDir=test-output/fixtures sampleRate=24000

import { writeFileSync, mkdirSync } from "node:fs";

const outDir = process.argv[2] || "test-output/fixtures";
const SAMPLE_RATE = Number(process.argv[3] || 24000);
const BITS = 16;
const MAX = 32767;

mkdirSync(outDir, { recursive: true });

function writeWav(name, samples) {
  const n = samples.length;
  const dataBytes = n * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.writeUInt32LE(0x46464952, 0); // RIFF
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.writeUInt32LE(0x45564157, 8); // WAVE
  buf.writeUInt32LE(0x20746d66, 12); // fmt
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(BITS, 34);
  buf.writeUInt32LE(0x61746164, 36); // data
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < n; i++) {
    const clamped = Math.max(-MAX, Math.min(MAX, Math.round(samples[i])));
    buf.writeInt16LE(clamped, 44 + i * 2);
  }
  const path = `${outDir}/${name}.wav`;
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${n} samples, ${(n / SAMPLE_RATE).toFixed(2)}s)`);
}

// Smooth raised-cosine envelope so onsets/offsets never click.
const envelope = (i, n) => {
  const attack = Math.min(1, i / (SAMPLE_RATE * 0.05));
  const release = Math.min(1, (n - i) / (SAMPLE_RATE * 0.05));
  return Math.min(attack, release);
};

const tone = (seconds, freq, amp = 16000) => {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE) * amp * envelope(i, n);
  }
  return out;
};

// --- 1. clean: a 3s vowel-like tone, no defects ---------------------------
{
  const s = tone(3.0, 300, 16000);
  writeWav("clean", s);
}

// --- 2. clipped: clean tone + a 40ms burst of samples pinned near full scale
//     (longer than the 0.02s clip gate) -------------------------------------
{
  const s = tone(3.0, 300, 16000);
  const clipStart = Math.floor(1.5 * SAMPLE_RATE);
  const clipFrames = Math.floor(0.04 * SAMPLE_RATE); // 40ms > 20ms gate
  for (let i = 0; i < clipFrames; i++) {
    s[clipStart + i] = i % 2 === 0 ? 32767 : 32700; // pinned at ceiling
  }
  writeWav("clipped", s);
}

// --- 3. transient: gentle tone + three short broadband energy pops ----------
// The pops are full-scale spikes against a QUIETER background tone so their
// RMS stands well above the local median (real crackle reads as a bright spike
// against surrounding speech, not on top of an equally-loud tone).
{
  const s = tone(3.0, 300, 5000);
  // A pop = a short full-scale broadband burst (a few cycles at 4 kHz).
  const popAt = (sec) => {
    const center = Math.floor(sec * SAMPLE_RATE);
    const popFrames = Math.floor(0.003 * SAMPLE_RATE); // 3ms burst
    for (let i = -popFrames; i < popFrames; i++) {
      const idx = center + i;
      if (idx < 0 || idx >= s.length) continue;
      const w = Math.exp(-(i * i) / (2 * (popFrames / 2.5) ** 2));
      s[idx] += Math.sin(2 * Math.PI * 4000 * i / SAMPLE_RATE) * 32000 * w;
    }
  };
  popAt(1.0);
  popAt(1.7);
  popAt(2.4);
  writeWav("transient", s);
}

// --- 4. segments20: 20 chunks; chunks 5 and 11 carry a defect the
//     DURATION-INDEPENDENT gates (Phase 1 clip + transient) catch per chunk.
//     The sustained tonal/buzz gates need >= 2-4s so can't fire on a 0.75s
//     chunk — those are validated separately via buzz.wav -------------------
{
  const segSec = 0.75;
  const totalFrames = Math.floor(20 * segSec * SAMPLE_RATE);
  const s = new Float64Array(totalFrames);
  for (let seg = 0; seg < 20; seg++) {
    const baseFreq = 250 + seg * 20;
    const start = Math.floor(seg * segSec * SAMPLE_RATE);
    const len = Math.floor(segSec * SAMPLE_RATE);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx >= totalFrames) break;
      s[idx] = Math.sin(2 * Math.PI * baseFreq * idx / SAMPLE_RATE) * 5000 * envelope(i, len);
    }
    if (seg === 5) {
      // clipped burst (40ms pinned at full scale -> clip gate)
      const cStart = start + Math.floor(len / 2);
      for (let i = 0; i < 0.05 * SAMPLE_RATE; i++) s[cStart + i] = 32767;
    } else if (seg === 11) {
      // transient pops (full-scale spikes against the chunk's quiet tone)
      for (let p = 0; p < 5; p++) {
        const center = start + Math.floor((0.15 + p * 0.16) * SAMPLE_RATE);
        const popFrames = Math.floor(0.003 * SAMPLE_RATE);
        for (let i = -popFrames; i < popFrames; i++) {
          const idx = center + i;
          if (idx >= start && idx < start + len) {
            const w = Math.exp(-(i * i) / (2 * (popFrames / 2.5) ** 2));
            s[idx] += Math.sin(2 * Math.PI * 4000 * i / SAMPLE_RATE) * 32000 * w;
          }
        }
      }
    }
  }
  writeWav("segments20", s);
  console.log("  (defects injected into chunks 5=clipped, 11=transient)");
}

// --- 5. buzz: a 5s sustained high-freq pure tone (machine-buzz artifact) ---
// Validates the PRE-EXISTING sustained tonal / high-dominant-frequency gates,
// which need >= 2-4s of audio and so can't be tested on a short chunk --------
{
  const s = tone(5.0, 1800, 26000);
  writeWav("buzz", s);
}

console.log("\nFixtures written. Validate with:");
console.log("  node scratch/analyse-audio.mjs test-output/fixtures/clean.wav");
console.log("  node scratch/analyse-audio.mjs test-output/fixtures/clipped.wav");
console.log("  node scratch/analyse-audio.mjs test-output/fixtures/transient.wav");
console.log("  node scratch/analyse-audio.mjs test-output/fixtures/segments20.wav 20");
