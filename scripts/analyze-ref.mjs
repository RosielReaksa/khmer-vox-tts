import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const refPath = "D:\\the api tts host\\outputs_10_voices\\duration_probe_15s_d.wav";
const buf = readFileSync(refPath);

// Find data chunk
let dataOffset = -1, dataSize = 0;
for (let i = 12; i + 8 < buf.length; i++) {
  if (buf.toString("ascii", i, i + 4) === "data") {
    dataOffset = i + 8;
    dataSize = buf.readUInt32LE(i + 4);
    if (dataSize > buf.length - dataOffset) dataSize = buf.length - dataOffset;
    break;
  }
}
const sampleRate = buf.readUInt32LE(24);
const channels = buf.readUInt16LE(22);
const bits = buf.readUInt16LE(34);
console.log("Reference audio file:", refPath);
console.log("Size:", buf.length, "bytes");
console.log("Sample rate:", sampleRate);
console.log("Channels:", channels);
console.log("Bits:", bits);
console.log("Duration:", (dataSize / (sampleRate * channels * (bits / 8))).toFixed(2), "s");

// Measure overall RMS
const n = Math.floor(dataSize / 2);
let sum = 0, peak = 0;
for (let i = 0; i < n; i++) {
  const s = buf.readInt16LE(dataOffset + i * 2);
  sum += s * s;
  const a = Math.abs(s);
  if (a > peak) peak = a;
}
const rms = Math.sqrt(sum / n);
console.log("Overall RMS:", rms.toFixed(0), "(" + (20 * Math.log10(rms / 32768)).toFixed(2) + " dBFS)");
console.log("Peak:", peak, "(" + (20 * Math.log10(peak / 32768)).toFixed(2) + " dBFS)");

// Measure spectral distribution
const N = 4096;
const startSec = 1.0;  // skip first 1s in case of silence
const start = Math.floor(startSec * sampleRate);

function dftMag(signal, k, N) {
  let re = 0, im = 0;
  for (let n = 0; n < N; n++) {
    const a = 2 * Math.PI * k * n / N;
    re += signal[n] * Math.cos(a);
    im -= signal[n] * Math.sin(a);
  }
  return Math.sqrt(re * re + im * im);
}

const halfN = Math.floor(N / 2);
const mag = new Float64Array(halfN);
const signal = new Float64Array(N);
for (let i = 0; i < N; i++) signal[i] = buf.readInt16LE(dataOffset + (start + i) * 2);
for (let k = 0; k < halfN; k++) mag[k] = dftMag(signal, k, N);

const totalE = mag.reduce((s, v) => s + v, 0);
const bands = [
  [0, 200, "sub-vocal"],
  [200, 500, "fundamental"],
  [500, 1000, "formants"],
  [1000, 2000, "consonants"],
  [2000, 3500, "sibil-low"],
  [3500, 5500, "sibil-high"],
  [5500, 8000, "air"],
  [8000, 12000, "ultra-high"],
];

console.log("\n=== Spectral distribution of the reference audio (1s window) ===");
for (const [lo, hi, name] of bands) {
  const kLo = Math.floor(lo * N / sampleRate);
  const kHi = Math.floor(hi * N / sampleRate);
  let e = 0;
  for (let k = kLo; k < kHi; k++) e += mag[k];
  const pct = totalE > 0 ? (e / totalE * 100) : 0;
  console.log(name.padEnd(14) + " (" + lo + "-" + hi + " Hz): " + pct.toFixed(1).padStart(5) + "%");
}

const nasal = (() => { let s = 0; for (let k = Math.floor(800*N/sampleRate); k < Math.floor(2500*N/sampleRate); k++) s += mag[k]; return s; })();
const clarity = (() => { let s = 0; for (let k = Math.floor(4000*N/sampleRate); k < Math.floor(8000*N/sampleRate); k++) s += mag[k]; return s; })();
const ultra = (() => { let s = 0; for (let k = Math.floor(8000*N/sampleRate); k < Math.floor(12000*N/sampleRate); k++) s += mag[k]; return s; })();
console.log("\n=== Diagnosis ===");
console.log("Nasal zone 800-2500 Hz:   " + (nasal/totalE*100).toFixed(1) + "%");
console.log("Clarity zone 4000-8000 Hz: " + (clarity/totalE*100).toFixed(1) + "%");
console.log("Ultra-high 8000-12000 Hz: " + (ultra/totalE*100).toFixed(1) + "%");
