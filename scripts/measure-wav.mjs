import { readFileSync } from "node:fs";

const p = String.raw\D:\ads testss\voxtts-tts-33619e91-ab5f-4084-9f42-5bcaa74a53d8 (1).wav\;
const buf = readFileSync(p);

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
const N = 4096;
const startSec = 4.0;
const start = Math.floor(startSec * sampleRate);
const signal = new Float64Array(N);
for (let i = 0; i < N; i++) {
  signal[i] = buf.readInt16LE(dataOffset + (start + i) * 2);
}

console.log("Window:", startSec, "s to", (startSec + N/sampleRate), "s");
console.log("Sample rate:", sampleRate);
console.log("Signal max:", Math.max(...signal).toFixed(0), "min:", Math.min(...signal).toFixed(0));

// DFT
const halfN = Math.floor(N / 2);
const mag = new Float64Array(halfN);
for (let k = 0; k < halfN; k++) {
  let re = 0, im = 0;
  for (let n = 0; n < N; n++) {
    const angle = 2 * Math.PI * k * n / N;
    re += signal[n] * Math.cos(angle);
    im -= signal[n] * Math.sin(angle);
  }
  mag[k] = Math.sqrt(re * re + im * im);
}

const totalE = mag.reduce((s, v) => s + v, 0);
console.log("Total spectral energy:", totalE.toFixed(0));

const bands = [
  [0, 200, "sub-vocal 0-200 Hz"],
  [200, 500, "vowel-fund 200-500 Hz"],
  [500, 1000, "vowel-formants 500-1000 Hz"],
  [1000, 2000, "consonants 1000-2000 Hz"],
  [2000, 3500, "sibil-low 2000-3500 Hz"],
  [3500, 5500, "sibil-high 3500-5500 Hz"],
  [5500, 8000, "air 5500-8000 Hz"],
  [8000, 12000, "ultra-high 8000-12000 Hz"],
];

console.log("");
console.log("Band                                   | Energy%  | Comment");
for (const [lo, hi, name] of bands) {
  const kLo = Math.floor(lo * N / sampleRate);
  const kHi = Math.floor(hi * N / sampleRate);
  let e = 0;
  for (let k = kLo; k < kHi; k++) e += mag[k];
  const pct = totalE > 0 ? (e / totalE * 100) : 0;
  console.log(${name.padEnd(38)} | %  |);
}

console.log("");
console.log("=== DIAGNOSIS ===");
const sumBand = (lo, hi) => {
  const kLo = Math.floor(lo * N / sampleRate);
  const kHi = Math.floor(hi * N / sampleRate);
  let e = 0;
  for (let k = kLo; k < kHi; k++) e += mag[k];
  return totalE > 0 ? e / totalE * 100 : 0;
};
const subPct = sumBand(0, 200);
const nasalPct = sumBand(800, 2500);
const clarityPct = sumBand(4000, 8000);
const ultraPct = sumBand(8000, 12000);
console.log(\Sub-vocal (0-200 Hz):         \%   <- muddy/boomy if high\);
console.log(\Nasal zone (800-2500 Hz):     \%   <- honky/nasal if >50%\);
console.log(\Clarity zone (4000-8000 Hz):  \%   <- muffled if <3%\);
console.log(\Ultra-high (8000-12000 Hz):   \%   <- hiss/air if high\);
