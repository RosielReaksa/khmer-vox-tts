import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const N = 4096;

function loadWav(p) {
  const buf = readFileSync(p);
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
  const totalSamples = Math.floor(dataSize / 2);
  return { buf, dataOffset, sampleRate, totalSamples };
}

function dftMag(signal, k, N) {
  let re = 0, im = 0;
  for (let n = 0; n < N; n++) {
    const a = 2 * Math.PI * k * n / N;
    re += signal[n] * Math.cos(a);
    im -= signal[n] * Math.sin(a);
  }
  return Math.sqrt(re * re + im * im);
}

function bandEnergy(signal, lo, hi, N, sampleRate) {
  const kLo = Math.floor(lo * N / sampleRate);
  const kHi = Math.floor(hi * N / sampleRate);
  let e = 0;
  for (let k = kLo; k < kHi; k++) e += dftMag(signal, k, N);
  return e;
}

function analyzeFile(path) {
  const { buf, dataOffset, sampleRate, totalSamples } = loadWav(path);
  // Skip leading silence: find first window with RMS > 1000
  const windowSec = 0.5;
  const windowSamples = Math.floor(windowSec * sampleRate);
  const step = windowSamples;
  // Pre-collect speech windows (RMS gated)
  const speechWindows = [];
  for (let start = 0; start + N <= totalSamples; start += step) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const s = buf.readInt16LE(dataOffset + (start + i) * 2);
      sum += s * s;
    }
    const rms = Math.sqrt(sum / N);
    if (rms > 1000) speechWindows.push(start);
  }
  // Aggregate spectral energy across all speech windows
  let totalAll = 0;
  const bands = [
    [0, 200, "sub-vocal (0-200)"],
    [200, 500, "fundamental (200-500)"],
    [500, 1000, "formants (500-1000)"],
    [1000, 2000, "consonants (1000-2000)"],
    [2000, 3500, "sibil-low (2000-3500)"],
    [3500, 5500, "sibil-high (3500-5500)"],
    [5500, 8000, "air (5500-8000)"],
    [8000, 12000, "ultra-high (8000-12000)"],
  ];
  const bandTotals = new Array(bands.length).fill(0);
  for (const start of speechWindows) {
    const signal = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      signal[i] = buf.readInt16LE(dataOffset + (start + i) * 2);
    }
    // Total energy over half-spectrum
    const halfN = Math.floor(N / 2);
    let total = 0;
    for (let k = 0; k < halfN; k++) total += dftMag(signal, k, N);
    totalAll += total;
    bands.forEach((b, i) => {
      bandTotals[i] += bandEnergy(signal, b[0], b[1], N, sampleRate);
    });
  }
  // Also compute overall RMS across speech windows
  let sumSq = 0, n = 0;
  for (const start of speechWindows) {
    for (let i = 0; i < N; i++) {
      const s = buf.readInt16LE(dataOffset + (start + i) * 2);
      sumSq += s * s;
      n++;
    }
  }
  const overallRms = n > 0 ? Math.sqrt(sumSq / n) : 0;
  const overallDbfs = overallRms > 0 ? 20 * Math.log10(overallRms / 32768) : -120;
  return {
    path,
    speechWindows: speechWindows.length,
    overallRms: overallRms.toFixed(0),
    overallDbfs: overallDbfs.toFixed(2),
    bandPcts: bandTotals.map((e) => totalAll > 0 ? (e / totalAll * 100) : 0),
  };
}

const results = files.map(analyzeFile);

console.log("");
console.log("================================================================");
console.log("SPECTRAL COMPARISON (averaged over all speech windows, RMS>1000)");
console.log("================================================================");
const bands = [
  [0, 200, "sub-vocal (0-200)"],
  [200, 500, "fundamental (200-500)"],
  [500, 1000, "formants (500-1000)"],
  [1000, 2000, "consonants (1000-2000)"],
  [2000, 3500, "sibil-low (2000-3500)"],
  [3500, 5500, "sibil-high (3500-5500)"],
  [5500, 8000, "air (5500-8000)"],
  [8000, 12000, "ultra-high (8000-12000)"],
];
const header = ["Band", ...results.map((r) => r.path.split(/[\\/]/).pop())];
console.log(header.map((h, i) => i === 0 ? h.padEnd(30) : h.padStart(20)).join(" | "));
console.log("-".repeat(30 + 22 * results.length));
for (let i = 0; i < bands.length; i++) {
  const row = [bands[i][2], ...results.map((r) => r.bandPcts[i].toFixed(1) + "%")];
  console.log(row.map((v, j) => j === 0 ? v.padEnd(30) : v.padStart(20)).join(" | "));
}
console.log("-".repeat(30 + 22 * results.length));
const meta = ["overall RMS (dBFS)", ...results.map((r) => r.overallDbfs + " dB")];
console.log(meta.map((v, j) => j === 0 ? v.padEnd(30) : v.padStart(20)).join(" | "));
const wincount = ["speech windows (500ms)", ...results.map((r) => r.speechWindows.toString())];
console.log(wincount.map((v, j) => j === 0 ? v.padEnd(30) : v.padStart(20)).join(" | "));

console.log("");
console.log("================================================================");
console.log("DIAGNOSIS BANDS (key indicators)");
console.log("================================================================");
const sumRange = (arr, lo, hi) => {
  let s = 0;
  for (let i = 0; i < bands.length; i++) {
    const [blo, bhi] = bands[i];
    if (blo < hi && bhi > lo) s += arr[i];
  }
  return s;
};
const diag = [
  ["sub-vocal 0-200 Hz (boomy if high)", 0, 200],
  ["vowel fundamental 200-500", 200, 500],
  ["nasal zone 800-2500 Hz", 800, 2500],
  ["clarity zone 4000-8000 Hz (muffled if <3)", 4000, 8000],
  ["ultra-high 8000-12000 Hz (air if high)", 8000, 12000],
];
const dHeader = ["Indicator", ...results.map((r) => r.path.split(/[\\/]/).pop())];
console.log(dHeader.map((h, i) => i === 0 ? h.padEnd(46) : h.padStart(20)).join(" | "));
console.log("-".repeat(46 + 22 * results.length));
for (const [name, lo, hi] of diag) {
  const row = [name, ...results.map((r) => sumRange(r.bandPcts, lo, hi).toFixed(2) + "%")];
  console.log(row.map((v, j) => j === 0 ? v.padEnd(46) : v.padStart(20)).join(" | "));
}

console.log("");
console.log("================================================================");
console.log("DELTAS (after-deNarrow vs before; full-chain vs before)");
console.log("================================================================");
if (results.length >= 3) {
  const before = results[0].bandPcts;
  const aDenarrow = results[1].bandPcts;
  const aFull = results[2].bandPcts;
  const dHeader2 = ["Band", "Δ after-deNarrow", "Δ after-FULL-CHAIN"];
  console.log(dHeader2.map((h, i) => i === 0 ? h.padEnd(30) : h.padStart(20)).join(" | "));
  for (let i = 0; i < bands.length; i++) {
    const d1 = aDenarrow[i] - before[i];
    const d2 = aFull[i] - before[i];
    const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
    console.log(bands[i][2].padEnd(30) + " | " + fmt(d1).padStart(20) + " | " + fmt(d2).padStart(20));
  }
  const dDiag = (lo, hi) => {
    const bef = sumRange(before, lo, hi);
    const a1 = sumRange(aDenarrow, lo, hi);
    const a2 = sumRange(aFull, lo, hi);
    return [bef, a1, a2];
  };
  console.log("-".repeat(72));
  for (const [name, lo, hi] of diag) {
    const [bef, a1, a2] = dDiag(lo, hi);
    const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
    console.log(name.padEnd(30) + " | " + fmt(a1 - bef).padStart(20) + " | " + fmt(a2 - bef).padStart(20));
  }
}
