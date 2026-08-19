// Standalone audio analyser — replicates the exact stats + quality-gate logic in
// lib/tts-provider.ts (getWavPcm16Stats + generatedAudioStatsIssue) WITHOUT
// importing that module (it pulls in server-only + native pg). Used to validate
// the Phase 1-3 detectors against synthetic fixtures with known artifacts.
//
// Usage:
//   node scratch/analyse-audio.mjs <file.wav> [segments]
//     segments = number of equal chunks to split the file into (default 1).
//   Set TTS_CANONICAL_SAMPLE_RATE to match the file if not 24000.
//
// Prints per-segment stats + which gate (if any) rejects it, so you can confirm
// clean audio passes and clipped/crackly/transient audio trips the new gates.

import { readFileSync } from "node:fs";

const SAMPLE_RATE = Number(process.env.TTS_CANONICAL_SAMPLE_RATE || 24000);

// --- env-driven knobs (mirror .env.example defaults exactly) --------------
const NUM = (name, def, lo, hi) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const v = Number(raw);
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : def));
};
const BOOL = (name, def) => {
  const raw = process.env[name];
  if (raw === undefined) return def;
  return raw === "true" || raw === "1";
};

const K = {
  // existing gates
  LOW_WINDOW_DB: NUM("TTS_AUDIO_LOW_WINDOW_DB", -45, -70, -25),
  ANALYSIS_WINDOW_SECONDS: NUM("TTS_AUDIO_ANALYSIS_WINDOW_SECONDS", 0.25, 0.05, 1),
  HIGH_ZCR_THRESHOLD: NUM("TTS_AUDIO_HIGH_ZCR_THRESHOLD", 0.42, 0.15, 0.9),
  MAX_LOW_WINDOW_RATIO: NUM("TTS_AUDIO_MAX_LOW_WINDOW_RATIO", 0.85, 0.2, 0.98),
  MAX_LONG_SILENCE_SECONDS: NUM("TTS_AUDIO_MAX_LONG_SILENCE_SECONDS", 10, 2, 30),
  MAX_TRAILING_SILENCE_SECONDS: NUM("TTS_AUDIO_MAX_TRAILING_SILENCE_SECONDS", 4, 0.5, 15),
  MAX_HIGH_ZCR_RATIO: NUM("TTS_AUDIO_MAX_HIGH_ZCR_RATIO", 0.18, 0.02, 0.8),
  MAX_HIGH_ZCR_SECONDS: NUM("TTS_AUDIO_MAX_HIGH_ZCR_SECONDS", 1, 0.25, 5),
  TONAL_GROUP_SECONDS: NUM("TTS_AUDIO_TONAL_GROUP_SECONDS", 1, 0.5, 3),
  TONAL_MIN_DB: NUM("TTS_AUDIO_TONAL_MIN_DB", -22, -40, -8),
  TONAL_MAX_ENVELOPE_CV: NUM("TTS_AUDIO_TONAL_MAX_ENVELOPE_CV", 0.18, 0.03, 1),
  TONAL_MIN_AVG_ZCR: NUM("TTS_AUDIO_TONAL_MIN_AVG_ZCR", 0.07, 0.01, 0.4),
  TONAL_MIN_PEAK_ZCR: NUM("TTS_AUDIO_TONAL_MIN_PEAK_ZCR", 0.1, 0.02, 0.6),
  MAX_STEADY_TONAL_SECONDS: NUM("TTS_AUDIO_MAX_STEADY_TONAL_SECONDS", 1.4, 0.75, 10),
  MAX_STEADY_TONAL_RATIO: NUM("TTS_AUDIO_MAX_STEADY_TONAL_RATIO", 0.12, 0.05, 0.8),
  BUZZ_MAX_CV: NUM("TTS_AUDIO_BUZZ_MAX_CV", 0.6, 0.2, 1.2),
  BUZZ_MIN_FREQ_HZ: NUM("TTS_AUDIO_BUZZ_MIN_FREQ_HZ", 800, 400, 2000),
  MAX_HIGH_DOMINANT_FREQ_SECONDS: NUM("TTS_AUDIO_MAX_HIGH_DOMINANT_FREQ_SECONDS", 0.9, 0.25, 5),
  MAX_HIGH_DOMINANT_FREQ_RATIO: NUM("TTS_AUDIO_MAX_HIGH_DOMINANT_FREQ_RATIO", 0.12, 0.03, 0.8),
  // Phase 1 new gates
  CLIP_THRESHOLD: NUM("TTS_AUDIO_CLIP_THRESHOLD", 32000, 30000, 32767),
  MAX_CLIPPED_RUN_SECONDS: NUM("TTS_AUDIO_MAX_CLIPPED_RUN_SECONDS", 0.02, 0.005, 0.5),
  TRANSIENT_WINDOW_SECONDS: NUM("TTS_AUDIO_TRANSIENT_WINDOW_SECONDS", 0.005, 0.002, 0.02),
  TRANSIENT_SPIKE_DB: NUM("TTS_AUDIO_TRANSIENT_SPIKE_DB", 9, 3, 20),
  TRANSIENT_SPIKE_MAX: NUM("TTS_AUDIO_TRANSIENT_SPIKE_MAX", 3, 0, 50),
  TRANSIENT_MEDIAN_WINDOWS: NUM("TTS_AUDIO_TRANSIENT_MEDIAN_WINDOWS", 11, 3, 41),
  MAX_TRANSIENT_BURST_SECONDS: NUM("TTS_AUDIO_MAX_TRANSIENT_BURST_SECONDS", 0.05, 0.01, 0.5),
};

const amplitudeToDb = (v) => 20 * Math.log10(v / 32768);
const dbToAmplitude = (db) => 32768 * Math.pow(10, db / 20);

// --- WAV reader (16-bit PCM, mono or stereo) ------------------------------
function readPcm16Wav(path) {
  const buf = readFileSync(path);
  if (buf.length < 44) throw new Error("file too small for a WAV");
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let audioFormat = 0, channels = 0, sampleRate = 0, bitsPerSample = 0;
  let dataOffset = 0, dataSize = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (id === "fmt " && size >= 16) {
      audioFormat = buf.readUInt16LE(dataStart);
      channels = buf.readUInt16LE(dataStart + 2);
      sampleRate = buf.readUInt32LE(dataStart + 4);
      bitsPerSample = buf.readUInt16LE(dataStart + 14);
    } else if (id === "data") {
      dataOffset = dataStart;
      const remaining = buf.length - dataStart;
      dataSize = size > remaining ? remaining : size;
      break;
    }
    if (dataStart + size > buf.length) break;
    offset = dataStart + size + (size % 2);
  }
  if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1 || channels > 2 || sampleRate <= 0) {
    throw new Error(`unsupported WAV format af=${audioFormat} bps=${bitsPerSample} ch=${channels} sr=${sampleRate}`);
  }
  const samples = Math.floor(dataSize / 2);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) pcm[i] = buf.readInt16LE(dataOffset + i * 2);
  return { pcm, sampleRate, channels, dataOffset, dataSize };
}

// --- stats (mirrors getWavPcm16Stats) -------------------------------------
function getStats(pcm, sampleRate, channels) {
  const bytesPerFrame = channels * 2;
  const totalFrames = Math.floor(pcm.length / channels);
  if (totalFrames <= 0) return null;

  const lowThreshold = dbToAmplitude(K.LOW_WINDOW_DB);
  const windowSeconds = K.ANALYSIS_WINDOW_SECONDS;
  const samplesPerWindow = Math.max(1, Math.round(sampleRate * channels * windowSeconds));
  const highZcrThreshold = K.HIGH_ZCR_THRESHOLD;

  let sumSquares = 0, peak = 0, samples = 0;
  let winSq = 0, winN = 0, winZc = 0, prev = 0, hasPrev = false;
  let lowWindows = 0, totalWindows = 0, curLow = 0, longestLow = 0, trailLow = 0;
  let hiZcWindows = 0, curHiZc = 0, longestHiZc = 0, maxZcr = 0;
  const winRms = [], winZcr = [];
  let lastZcIdx = -1, iSum = 0, iSumSq = 0, iCount = 0;
  // High-dominant-frequency ("machine buzz") counters, updated inside flushWin.
  let hiDomWindows = 0, curHiDom = 0, longestHiDom = 0;

  // Phase 1 accumulators
  const clipThreshold = K.CLIP_THRESHOLD;
  let curClip = 0, longestClip = 0;
  const transientWinSec = K.TRANSIENT_WINDOW_SECONDS;
  const transientPerWin = Math.max(1, Math.round(sampleRate * channels * transientWinSec));
  let tWinSq = 0, tWinN = 0;
  const transientRms = [];

  const flushWin = () => {
    if (winN === 0) return;
    const rms = Math.sqrt(winSq / winN);
    const isLow = rms < lowThreshold;
    const zcr = winZc / Math.max(1, winN - 1);
    const isHiZc = !isLow && zcr >= highZcrThreshold;
    winRms.push(rms);
    winZcr.push(zcr);
    totalWindows += 1;
    let isHiDom = false;
    if (!isLow && iCount >= 8 && iSum > 0) {
      const mean = iSum / iCount;
      const variance = Math.max(0, iSumSq / iCount - mean * mean);
      const cv = Math.sqrt(variance) / mean;
      const fundHz = sampleRate / (2 * mean);
      isHiDom = cv < K.BUZZ_MAX_CV && fundHz > K.BUZZ_MIN_FREQ_HZ;
    }
    if (isLow) { lowWindows++; curLow++; trailLow++; longestLow = Math.max(longestLow, curLow); }
    else { curLow = 0; trailLow = 0; }
    if (isHiZc) { hiZcWindows++; curHiZc++; longestHiZc = Math.max(longestHiZc, curHiZc); }
    else curHiZc = 0;
    if (isHiDom) { hiDomWindows++; curHiDom++; longestHiDom = Math.max(longestHiDom, curHiDom); }
    else curHiDom = 0;
    maxZcr = Math.max(maxZcr, zcr);
    winSq = 0; winN = 0; winZc = 0; prev = 0; hasPrev = false;
    lastZcIdx = -1; iSum = 0; iSumSq = 0; iCount = 0;
  };

  for (let s = 0; s < totalFrames; s++) {
    for (let ch = 0; ch < channels; ch++) {
      const value = pcm[s * channels + ch];
      const abs = Math.abs(value);
      const square = value * value;
      peak = Math.max(peak, abs);
      sumSquares += square;
      samples += 1;
      winSq += square;
      winN += 1;
      if (hasPrev && value !== 0 && prev !== 0 && (value > 0) !== (prev > 0)) {
        winZc += 1;
        if (lastZcIdx >= 0) {
          const interval = samples - lastZcIdx;
          iSum += interval; iSumSq += interval * interval; iCount += 1;
        }
        lastZcIdx = samples;
      }
      prev = value;
      hasPrev = true;

      // clipping run
      if (abs >= clipThreshold) {
        curClip += 1;
        if (curClip > longestClip) longestClip = curClip;
      } else {
        curClip = 0;
      }
      // transient fine window
      tWinSq += square; tWinN += 1;
      if (tWinN >= transientPerWin) {
        transientRms.push(Math.sqrt(tWinSq / tWinN));
        tWinSq = 0; tWinN = 0;
      }
    }
    if (winN >= samplesPerWindow) flushWin();
  }
  flushWin();
  if (tWinN > 0) transientRms.push(Math.sqrt(tWinSq / tWinN));

  // --- steady-tonal envelope pass (mirrors getSteadyTonalStats) ------------
  const groupWindows = Math.max(2, Math.round(K.TONAL_GROUP_SECONDS / Math.max(0.01, windowSeconds)));
  let tonalGroups = 0, totalGroups = 0, curTonal = 0, longestTonal = 0;
  for (let i = 0; i + groupWindows <= winRms.length; i++) {
    const rmsG = winRms.slice(i, i + groupWindows);
    const zcrG = winZcr.slice(i, i + groupWindows);
    const mean = rmsG.reduce((a, b) => a + b, 0) / rmsG.length;
    const vari = rmsG.reduce((a, b) => a + (b - mean) ** 2, 0) / rmsG.length;
    const cv = Math.sqrt(vari) / Math.max(1, mean);
    const avgZcr = zcrG.reduce((a, b) => a + b, 0) / zcrG.length;
    const peakZcr = Math.max(...zcrG);
    const isTonal = mean >= dbToAmplitude(K.TONAL_MIN_DB) && cv <= K.TONAL_MAX_ENVELOPE_CV
      && avgZcr >= K.TONAL_MIN_AVG_ZCR && peakZcr >= K.TONAL_MIN_PEAK_ZCR;
    totalGroups += 1;
    if (isTonal) { tonalGroups++; curTonal++; longestTonal = Math.max(longestTonal, curTonal); }
    else curTonal = 0;
  }
  const lowWinSec = samplesPerWindow / Math.max(1, sampleRate * channels);
  const longestTonalSec = longestTonal > 0 ? (longestTonal - 1 + groupWindows) * lowWinSec : 0;

  // --- transient spike pass (Phase 1) ---
  const halfMed = Math.floor(K.TRANSIENT_MEDIAN_WINDOWS / 2);
  let spikeCount = 0, curBurst = 0, longestBurst = 0;
  for (let w = 0; w < transientRms.length; w++) {
    const s = Math.max(0, w - halfMed);
    const e = Math.min(transientRms.length, w + halfMed + 1);
    const nb = transientRms.slice(s, e).sort((a, b) => a - b);
    const median = nb[Math.floor(nb.length / 2)];
    if (median > 0 && transientRms[w] / median > Math.pow(10, K.TRANSIENT_SPIKE_DB / 20)) {
      spikeCount++; curBurst++; longestBurst = Math.max(longestBurst, curBurst);
    } else curBurst = 0;
  }

  const rms = Math.sqrt(sumSquares / samples);
  return {
    rms,
    peak,
    durationSeconds: totalFrames / sampleRate,
    rmsDb: amplitudeToDb(rms),
    peakDb: amplitudeToDb(peak),
    lowWindowRatio: totalWindows > 0 ? lowWindows / totalWindows : 0,
    longestLowSeconds: longestLow * lowWinSec,
    trailingLowSeconds: trailLow * lowWinSec,
    highZeroCrossingWindowRatio: totalWindows > 0 ? hiZcWindows / totalWindows : 0,
    longestHighZeroCrossingSeconds: longestHiZc * lowWinSec,
    maximumZeroCrossingRate: maxZcr,
    steadyTonalWindowRatio: totalGroups > 0 ? tonalGroups / totalGroups : 0,
    longestSteadyTonalSeconds: longestTonalSec,
    highDominantFreqWindowRatio: totalWindows > 0 ? hiDomWindows / totalWindows : 0,
    longestHighDominantFreqSeconds: longestHiDom * lowWinSec,
    longestClippedRunSeconds: sampleRate > 0 ? longestClip / sampleRate : 0,
    transientSpikeCount: spikeCount,
    longestTransientBurstSeconds: longestBurst * transientWinSec,
  };
}

// --- quality gates (mirror generatedAudioStatsIssue) ----------------------
function checkGates(stats) {
  const issues = [];
  const dur = stats.durationSeconds ?? 0;
  if (dur < 0.2) issues.push("audio is too short");
  if (stats.rms < 80 && stats.peak < 1200) issues.push(`very low level (${stats.rmsDb.toFixed(1)} dB)`);
  if (dur >= 3 && stats.lowWindowRatio > K.MAX_LOW_WINDOW_RATIO) issues.push(`mostly quiet (${Math.round(stats.lowWindowRatio * 100)}%)`);
  if (dur >= 3 && stats.trailingLowSeconds > K.MAX_TRAILING_SILENCE_SECONDS) issues.push(`long quiet tail (${stats.trailingLowSeconds.toFixed(1)}s)`);
  if (dur >= 8 && stats.longestLowSeconds > K.MAX_LONG_SILENCE_SECONDS) issues.push(`long silence (${stats.longestLowSeconds.toFixed(1)}s)`);
  if (dur >= 2 && stats.longestHighZeroCrossingSeconds > K.MAX_HIGH_ZCR_SECONDS) issues.push(`sustained noise (${stats.longestHighZeroCrossingSeconds.toFixed(1)}s)`);
  if (dur >= 4 && stats.highZeroCrossingWindowRatio > K.MAX_HIGH_ZCR_RATIO) issues.push(`too much high-freq noise (${Math.round(stats.highZeroCrossingWindowRatio * 100)}%)`);
  if (dur >= 4 && stats.longestSteadyTonalSeconds > K.MAX_STEADY_TONAL_SECONDS) issues.push(`stuck tonal (${stats.longestSteadyTonalSeconds.toFixed(1)}s)`);
  if (dur >= 8 && stats.steadyTonalWindowRatio > K.MAX_STEADY_TONAL_RATIO) issues.push(`too much tonal (${Math.round(stats.steadyTonalWindowRatio * 100)}%)`);
  if (dur >= 2 && stats.longestHighDominantFreqSeconds > K.MAX_HIGH_DOMINANT_FREQ_SECONDS) issues.push(`high-freq tone (${stats.longestHighDominantFreqSeconds.toFixed(1)}s)`);
  if (dur >= 4 && stats.highDominantFreqWindowRatio > K.MAX_HIGH_DOMINANT_FREQ_RATIO) issues.push(`too much high-freq tone (${Math.round(stats.highDominantFreqWindowRatio * 100)}%)`);
  // Phase 1 new gates
  if (stats.longestClippedRunSeconds > K.MAX_CLIPPED_RUN_SECONDS) issues.push(`clipped/crackle burst (${stats.longestClippedRunSeconds.toFixed(3)}s run)`);
  if (stats.transientSpikeCount > K.TRANSIENT_SPIKE_MAX) issues.push(`transient crackle/pop (${stats.transientSpikeCount} spikes)`);
  if (stats.longestTransientBurstSeconds > K.MAX_TRANSIENT_BURST_SECONDS) issues.push(`sustained crackle burst (${stats.longestTransientBurstSeconds.toFixed(3)}s)`);
  return issues;
}

// --- main -----------------------------------------------------------------
const file = process.argv[2];
const segments = Math.max(1, Math.floor(Number(process.argv[3] || "1")));
if (!file) {
  console.error("usage: node scratch/analyse-audio.mjs <file.wav> [segments]");
  process.exit(1);
}

const { pcm, sampleRate, channels } = readPcm16Wav(file);
const totalFrames = Math.floor(pcm.length / channels);
const segFrames = Math.floor(totalFrames / segments);
console.log(`\n=== ${file} ===`);
console.log(`sampleRate=${sampleRate} channels=${channels} frames=${totalFrames} duration=${(totalFrames / sampleRate).toFixed(2)}s segments=${segments}\n`);

let anyFail = false;
for (let seg = 0; seg < segments; seg++) {
  const startFrame = seg * segFrames;
  const endFrame = seg === segments - 1 ? totalFrames : startFrame + segFrames;
  const segPcm = pcm.subarray(startFrame * channels, endFrame * channels);
  const stats = getStats(segPcm, sampleRate, channels);
  if (!stats) { console.log(`[seg ${seg}] EMPTY`); continue; }
  const issues = checkGates(stats);
  if (issues.length > 0) anyFail = true;
  const status = issues.length ? `FAIL: ${issues.join("; ")}` : "PASS";
  console.log(`[seg ${seg}] ${(stats.durationSeconds).toFixed(2)}s | rms ${stats.rmsDb.toFixed(1)}dB peak ${stats.peakDb.toFixed(1)}dB | clipRun ${stats.longestClippedRunSeconds.toFixed(3)}s spikes ${stats.transientSpikeCount} burst ${stats.longestTransientBurstSeconds.toFixed(3)}s | tonal ${stats.longestSteadyTonalSeconds.toFixed(2)}s | ${status}`);
}

console.log(`\n=== ${anyFail ? "SOME SEGMENTS REJECTED (gates working)" : "ALL SEGMENTS PASS"} ===`);
process.exit(anyFail ? 2 : 0);
