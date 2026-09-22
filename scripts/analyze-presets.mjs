import { readFileSync } from "node:fs";

function analyze(path) {
  console.log("\n=== " + path + " ===");
  const buf = readFileSync(path);
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
  const duration = dataSize / (sampleRate * channels * (bits / 8));
  console.log("Size:", buf.length, "Duration:", duration.toFixed(2), "s  SR:", sampleRate, "Ch:", channels);

  const n = Math.floor(dataSize / 2);
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(dataOffset + i * 2);
    sum += s * s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / n);
  console.log("RMS:", rms.toFixed(0), "(" + (20 * Math.log10(rms / 32768)).toFixed(2) + " dBFS)");
  console.log("Peak:", peak, "(" + (20 * Math.log10(peak / 32768)).toFixed(2) + " dBFS)");

  // Skip silence at start
  let firstSpeech = -1;
  for (let w = 0; w < Math.floor(n / 4800); w++) {
    let s2 = 0;
    for (let i = 0; i < 4800; i++) {
      const s = buf.readInt16LE(dataOffset + (w * 4800 + i) * 2);
      s2 += s * s;
    }
    const r = Math.sqrt(s2 / 4800);
    if (r > 500 && firstSpeech < 0) { firstSpeech = w * 0.2; break; }
  }
  if (firstSpeech < 0) firstSpeech = 0;
  console.log("First speech at:", firstSpeech.toFixed(2), "s");

  const N = 4096;
  const start = Math.floor((firstSpeech + 1) * sampleRate);
  const signal = new Float64Array(N);
  for (let i = 0; i < N; i++) signal[i] = buf.readInt16LE(dataOffset + (start + i) * 2);

  const halfN = Math.floor(N / 2);
  let total = 0;
  const mag = new Float64Array(halfN);
  for (let k = 0; k < halfN; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = 2 * Math.PI * k * n / N;
      re += signal[n] * Math.cos(a);
      im -= signal[n] * Math.sin(a);
    }
    mag[k] = Math.sqrt(re * re + im * im);
    total += mag[k];
  }
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
  for (const [lo, hi, name] of bands) {
    const kLo = Math.floor(lo * N / sampleRate);
    const kHi = Math.floor(hi * N / sampleRate);
    let e = 0;
    for (let k = kLo; k < kHi; k++) e += mag[k];
    const pct = total > 0 ? (e / total * 100) : 0;
    console.log("  " + name.padEnd(14) + " (" + lo + "-" + hi + " Hz): " + pct.toFixed(1).padStart(5) + "%");
  }
  const nasal = (() => { let s = 0; for (let k = Math.floor(800*N/sampleRate); k < Math.floor(2500*N/sampleRate); k++) s += mag[k]; return s; })();
  const clarity = (() => { let s = 0; for (let k = Math.floor(4000*N/sampleRate); k < Math.floor(8000*N/sampleRate); k++) s += mag[k]; return s; })();
  const ultra = (() => { let s = 0; for (let k = Math.floor(8000*N/sampleRate); k < Math.floor(12000*N/sampleRate); k++) s += mag[k]; return s; })();
  console.log("  >> Nasal 800-2500: " + (nasal/total*100).toFixed(1) + "%   Clarity 4000-8000: " + (clarity/total*100).toFixed(1) + "%   Ultra 8000-12000: " + (ultra/total*100).toFixed(1) + "%");
}

analyze("D:\\website api seller\\public\\voices\\reference_female.wav");
analyze("D:\\website api seller\\public\\voices\\reference_male.wav");
