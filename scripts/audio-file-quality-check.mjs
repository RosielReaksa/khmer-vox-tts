#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function fail(message, detail = "") {
  console.error(`FAIL ${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
}

function pass(message, detail = "") {
  console.log(`PASS ${message}${detail ? `: ${detail}` : ""}`);
}

function runFfmpeg(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-i",
      file,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
        return;
      }
      resolve(stderr);
    });
  });
}

function decodePcm(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-f",
      "s16le",
      "pipe:1",
    ]);
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg PCM decode exited with code ${code}\n${stderr}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

function parseDurationSeconds(output) {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseVolume(output, name) {
  const match = output.match(new RegExp(`${name}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB`));
  return match ? Number(match[1]) : null;
}

function numericEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function analyzePcm(pcm, sampleRate = 24000) {
  const windowSeconds = numericEnv("TTS_AUDIO_ANALYSIS_WINDOW_SECONDS", 0.25);
  const samplesPerWindow = Math.max(1, Math.round(sampleRate * windowSeconds));
  const lowThreshold = 32768 * Math.pow(10, numericEnv("TTS_AUDIO_LOW_WINDOW_DB", -45) / 20);
  const highZcrThreshold = numericEnv("TTS_AUDIO_HIGH_ZCR_THRESHOLD", 0.42);
  const totalSamples = Math.floor(pcm.length / 2);
  let totalWindows = 0;
  let highZcrWindows = 0;
  let currentHighZcrWindows = 0;
  let longestHighZcrWindows = 0;
  let currentLowWindows = 0;
  let longestLowWindows = 0;
  const windowRmsValues = [];
  const windowZeroCrossingRates = [];

  for (let startSample = 0; startSample < totalSamples; startSample += samplesPerWindow) {
    const endSample = Math.min(totalSamples, startSample + samplesPerWindow);
    let sumSquares = 0;
    let zeroCrossings = 0;
    let previous = 0;
    let hasPrevious = false;

    for (let sample = startSample; sample < endSample; sample++) {
      const value = pcm.readInt16LE(sample * 2);
      sumSquares += value * value;
      if (hasPrevious && value !== 0 && previous !== 0 && (value > 0) !== (previous > 0)) {
        zeroCrossings += 1;
      }
      previous = value;
      hasPrevious = true;
    }

    const sampleCount = Math.max(1, endSample - startSample);
    const rms = Math.sqrt(sumSquares / sampleCount);
    const zcr = zeroCrossings / Math.max(1, sampleCount - 1);
    const isLow = rms < lowThreshold;
    const isHighZcr = !isLow && zcr >= highZcrThreshold;
    windowRmsValues.push(rms);
    windowZeroCrossingRates.push(zcr);
    totalWindows += 1;

    if (isLow) {
      currentLowWindows += 1;
      longestLowWindows = Math.max(longestLowWindows, currentLowWindows);
    } else {
      currentLowWindows = 0;
    }

    if (isHighZcr) {
      highZcrWindows += 1;
      currentHighZcrWindows += 1;
      longestHighZcrWindows = Math.max(longestHighZcrWindows, currentHighZcrWindows);
    } else {
      currentHighZcrWindows = 0;
    }
  }

  const tonal = analyzeSteadyTonalWindows(
    windowRmsValues,
    windowZeroCrossingRates,
    windowSeconds,
  );

  return {
    highZcrRatio: totalWindows > 0 ? highZcrWindows / totalWindows : 0,
    longestHighZcrSeconds: longestHighZcrWindows * windowSeconds,
    longestLowSeconds: longestLowWindows * windowSeconds,
    steadyTonalRatio: tonal.ratio,
    longestSteadyTonalSeconds: tonal.longestSeconds,
  };
}

function analyzeSteadyTonalWindows(windowRmsValues, windowZeroCrossingRates, windowSeconds) {
  if (!windowRmsValues.length || windowRmsValues.length !== windowZeroCrossingRates.length) {
    return { ratio: 0, longestSeconds: 0 };
  }

  const groupSeconds = numericEnv("TTS_AUDIO_TONAL_GROUP_SECONDS", 1);
  const groupWindows = Math.max(2, Math.round(groupSeconds / Math.max(0.01, windowSeconds)));
  if (windowRmsValues.length < groupWindows) {
    return { ratio: 0, longestSeconds: 0 };
  }

  const minRms = 32768 * Math.pow(10, numericEnv("TTS_AUDIO_TONAL_MIN_DB", -22) / 20);
  const maxEnvelopeCv = numericEnv("TTS_AUDIO_TONAL_MAX_ENVELOPE_CV", 0.18);
  const minAverageZcr = numericEnv("TTS_AUDIO_TONAL_MIN_AVG_ZCR", 0.07);
  const minPeakZcr = numericEnv("TTS_AUDIO_TONAL_MIN_PEAK_ZCR", 0.10);

  let totalGroups = 0;
  let tonalGroups = 0;
  let currentTonalGroups = 0;
  let longestTonalGroups = 0;

  for (let index = 0; index + groupWindows <= windowRmsValues.length; index++) {
    const rmsGroup = windowRmsValues.slice(index, index + groupWindows);
    const zcrGroup = windowZeroCrossingRates.slice(index, index + groupWindows);
    const meanRms = rmsGroup.reduce((sum, value) => sum + value, 0) / rmsGroup.length;
    const variance = rmsGroup.reduce((sum, value) => sum + ((value - meanRms) ** 2), 0) / rmsGroup.length;
    const envelopeCv = Math.sqrt(variance) / Math.max(1, meanRms);
    const averageZcr = zcrGroup.reduce((sum, value) => sum + value, 0) / zcrGroup.length;
    const peakZcr = Math.max(...zcrGroup);
    const isSteadyTonal =
      meanRms >= minRms &&
      envelopeCv <= maxEnvelopeCv &&
      averageZcr >= minAverageZcr &&
      peakZcr >= minPeakZcr;

    totalGroups += 1;
    if (isSteadyTonal) {
      tonalGroups += 1;
      currentTonalGroups += 1;
      longestTonalGroups = Math.max(longestTonalGroups, currentTonalGroups);
    } else {
      currentTonalGroups = 0;
    }
  }

  return {
    ratio: totalGroups > 0 ? tonalGroups / totalGroups : 0,
    // Matches lib/tts-provider.ts: a run of N consecutive tonal group-starts
    // spans N-1+groupWindows windows of real audio.
    longestSeconds: longestTonalGroups > 0
      ? (longestTonalGroups - 1 + groupWindows) * windowSeconds
      : 0,
  };
}

async function main() {
  const file = arg("file", process.argv[2] ?? "");
  if (!file) {
    console.log("Usage: node scripts/audio-file-quality-check.mjs --file D:\\path\\audio.mp3");
    return;
  }

  const absolute = path.resolve(file);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    fail("audio file exists", absolute);
    return;
  }
  if (stat.size < 1024) {
    fail("audio file size", `${stat.size} bytes is too small.`);
    return;
  }

  const output = await runFfmpeg(absolute);
  const durationSeconds = parseDurationSeconds(output);
  const meanVolume = parseVolume(output, "mean_volume");
  const maxVolume = parseVolume(output, "max_volume");

  if (durationSeconds === null || durationSeconds < 0.5) {
    fail("audio duration", `duration=${durationSeconds ?? "unknown"}`);
    return;
  }
  if (meanVolume === null || maxVolume === null) {
    fail("audio volume analysis", "ffmpeg did not report mean/max volume.");
    return;
  }
  if (maxVolume <= -45 || meanVolume <= -55) {
    fail("audio is not silent", `mean=${meanVolume} dB, max=${maxVolume} dB`);
    return;
  }

  const pcm = await decodePcm(absolute);
  const analysis = analyzePcm(pcm);
  const maxHighZcrRatio = numericEnv("TTS_AUDIO_MAX_HIGH_ZCR_RATIO", 0.18);
  const maxHighZcrSeconds = numericEnv("TTS_AUDIO_MAX_HIGH_ZCR_SECONDS", 1);
  const maxLongSilenceSeconds = numericEnv("TTS_AUDIO_MAX_LONG_SILENCE_SECONDS", 10);
  const maxSteadyTonalSeconds = numericEnv("TTS_AUDIO_MAX_STEADY_TONAL_SECONDS", 1.5);
  const maxSteadyTonalRatio = numericEnv("TTS_AUDIO_MAX_STEADY_TONAL_RATIO", 0.12);

  if (analysis.longestHighZcrSeconds > maxHighZcrSeconds) {
    fail(
      "audio has no sustained non-speech noise",
      `longest high-ZCR section=${analysis.longestHighZcrSeconds.toFixed(2)}s`,
    );
    return;
  }
  if (analysis.highZcrRatio > maxHighZcrRatio) {
    fail(
      "audio high-frequency noise ratio",
      `high-ZCR windows=${(analysis.highZcrRatio * 100).toFixed(1)}%`,
    );
    return;
  }
  if (analysis.longestLowSeconds > maxLongSilenceSeconds) {
    fail(
      "audio has no excessive silent section",
      `longest low-level section=${analysis.longestLowSeconds.toFixed(2)}s`,
    );
    return;
  }
  if (analysis.longestSteadyTonalSeconds > maxSteadyTonalSeconds) {
    fail(
      "audio has no sustained stuck tonal section",
      `longest stuck-tonal section=${analysis.longestSteadyTonalSeconds.toFixed(2)}s`,
    );
    return;
  }
  if (analysis.steadyTonalRatio > maxSteadyTonalRatio) {
    fail(
      "audio stuck-tonal ratio",
      `stuck-tonal windows=${(analysis.steadyTonalRatio * 100).toFixed(1)}%`,
    );
    return;
  }

  pass(
    "audio file quality",
    [
      `duration=${durationSeconds.toFixed(2)}s`,
      `mean=${meanVolume} dB`,
      `max=${maxVolume} dB`,
      `high-ZCR=${(analysis.highZcrRatio * 100).toFixed(1)}%`,
      `longest high-ZCR=${analysis.longestHighZcrSeconds.toFixed(2)}s`,
      `longest low=${analysis.longestLowSeconds.toFixed(2)}s`,
      `stuck-tonal=${(analysis.steadyTonalRatio * 100).toFixed(1)}%`,
      `longest stuck-tonal=${analysis.longestSteadyTonalSeconds.toFixed(2)}s`,
    ].join(", "),
  );
}

main().catch((error) => {
  fail("audio quality check crashed", error instanceof Error ? error.message : String(error));
});
