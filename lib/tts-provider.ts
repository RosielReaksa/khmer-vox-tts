import "server-only";

import { spawn } from "child_process";

import {
  PUBLIC_AUDIO_CONTENT_TYPE,
  PUBLIC_AUDIO_OUTPUT_FORMAT,
} from "@/lib/audio-api";
import { hasSpeakableText } from "@/lib/speech-text-sanitizer";
import type { GenerationMode } from "@/lib/types";
import {
  isBuiltinStyleVoiceDescription,
  OFFICIAL_VOXCPM2_CLONE_VOICE,
} from "@/lib/voice-defaults";
import {
  disableEndpoint,
  getUpstreamEndpoints,
  selectUpstreamEndpoint,
  type UpstreamEndpoint,
} from "./tts-endpoints";

export class TtsProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export type CloneSample = {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
};

export type TtsSynthesisResult = {
  audioBytes: Uint8Array;
  contentType: string;
  model: string;
  upstreamRequestId: string | null;
  outputSeconds: number | null;
};

type AudioResponseFormat =
  | typeof PUBLIC_AUDIO_OUTPUT_FORMAT
  | "wav"
  | "ogg"
  | "webm";

// The model encodes reference into latents; any pre-processing degrades the
// voice identity the model learns. Only convert format (mono 16kHz WAV).
// Override with TTS_REFERENCE_AUDIO_FILTER env if a specific reference needs
// cleanup (e.g. "highpass=f=70,lowpass=f=12000").
const DEFAULT_REFERENCE_AUDIO_FILTER = "";

function recordMetric(
  url: string,
  characterCount: number,
  latencyMs: number,
  success: boolean,
): void {
  import("./modal-analytics")
    .then((module) =>
      module.recordSynthesisMetric(url, characterCount, latencyMs, success),
    )
    .catch(console.error);
}

export function selectEndpoint(): UpstreamEndpoint {
  const endpoint = selectUpstreamEndpoint();
  if (!endpoint) {
    throw new TtsProviderError(
      "TTS upstream is not configured. Set TTS_UPSTREAM_POOL or TTS_UPSTREAM_URL in environment.",
      503,
    );
  }
  return endpoint;
}

function readAudioResponseFormat(): AudioResponseFormat {
  const value = (process.env.TTS_UPSTREAM_RESPONSE_FORMAT ?? "")
    .trim()
    .toLowerCase();
  if (
    value === PUBLIC_AUDIO_OUTPUT_FORMAT ||
    value === "wav" ||
    value === "ogg" ||
    value === "webm"
  )
    return value;
  return PUBLIC_AUDIO_OUTPUT_FORMAT;
}

function readAudioFilter(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (value === "off" || value === "none" || value === "0") return "";
  return value ?? fallback;
}

function audioFilterArgs(filter: string): string[] {
  return filter ? ["-af", filter] : [];
}

function readCanonicalGeneratedSampleRate(): number {
  return Math.round(
    readNumericEnv("TTS_CANONICAL_SAMPLE_RATE", 24000, 8000, 48000),
  );
}

function contentTypeForResponseFormat(format: AudioResponseFormat): string {
  if (format === PUBLIC_AUDIO_OUTPUT_FORMAT) return PUBLIC_AUDIO_CONTENT_TYPE;
  if (format === "ogg") return "audio/ogg";
  if (format === "webm") return "audio/webm";
  return "audio/wav";
}

function normalizeContentType(
  value: string | null,
  fallback = "audio/wav",
): string {
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (lower.includes("audio/")) {
    return value;
  }
  return fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function errorTextFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 300) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(errorTextFromValue)
      .filter((part): part is string => Boolean(part));
    return parts.length ? parts.join("; ").slice(0, 300) : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "reason", "code"]) {
      const nested = errorTextFromValue(record[key]);
      if (nested) return nested;
    }
    try {
      return JSON.stringify(value).slice(0, 300);
    } catch {
      return "Upstream returned an unreadable error object.";
    }
  }
  return null;
}

function upstreamErrorMessage(body: unknown, fallback: string): string {
  return errorTextFromValue(body) ?? fallback;
}

async function normalizeCloneSampleForUpstream(
  sample: CloneSample,
): Promise<CloneSample> {
  try {
    const referenceFilter = readAudioFilter(
      "TTS_REFERENCE_AUDIO_FILTER",
      DEFAULT_REFERENCE_AUDIO_FILTER,
    );
    const wavBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        ...audioFilterArgs(referenceFilter),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      sample.bytes,
    );
    if (wavBytes.byteLength <= 0) {
      throw new TtsProviderError(
        "Reference audio conversion produced empty audio.",
        400,
      );
    }
    const durationSeconds = inferWavDurationSeconds(wavBytes);
    if (durationSeconds !== null && durationSeconds < 0.5) {
      throw new TtsProviderError(
        "Reference voice sample is too short. Upload a clear 5-30 second voice sample.",
        400,
      );
    }
    return {
      bytes: wavBytes,
      mimeType: "audio/wav",
      fileName: "reference.wav",
    };
  } catch (error) {
    if (error instanceof TtsProviderError) {
      if (error.status >= 500) {
        throw new TtsProviderError(
          "Reference audio could not be converted. Upload a clear WAV or MP3 voice sample.",
          400,
        );
      }
      throw error;
    }
    throw new TtsProviderError(
      "Reference audio could not be processed. Upload a clear WAV or MP3 voice sample.",
      400,
    );
  }
}

function normalizeCloneVoiceDescription(voice: string): string {
  const trimmed = voice.trim();
  const lower = trimmed.toLowerCase();
  const oldDashboardPresetNames = new Set(["maly", "sokha", "piseth", "dara"]);

  if (!trimmed || oldDashboardPresetNames.has(lower)) {
    return OFFICIAL_VOXCPM2_CLONE_VOICE;
  }

  return trimmed;
}

/** Official VoxCPM2: ref_audio pins timbre; voice description is optional and off by default. */
function upstreamVoiceDescriptionForClone(voice: string): string | null {
  if (!readBooleanEnv("TTS_CLONE_USE_VOICE_DESCRIPTION", false)) {
    return null;
  }
  const description = normalizeCloneVoiceDescription(voice);
  if (isBuiltinStyleVoiceDescription(description)) {
    return OFFICIAL_VOXCPM2_CLONE_VOICE;
  }
  return description.trim() || null;
}

function isPresetReferenceSample(
  sample: CloneSample | undefined | null,
): boolean {
  if (!sample?.fileName) return false;
  return /^reference_(male|female)\.wav$/i.test(sample.fileName.trim());
}

function readNumericEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.round(readNumericEnv(name, fallback, min, max));
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function estimatedCharsPerSecond(mode: GenerationMode): number {
  return mode === "clone" ? 13 : 20;
}

function upstreamChunkChars(mode: GenerationMode): number {
  const targetSeconds = readIntegerEnv(
    "TTS_UPSTREAM_CHUNK_TARGET_SECONDS",
    60,
    15,
    120,
  );
  const fallback = Math.round(estimatedCharsPerSecond(mode) * targetSeconds);
  const configured = Number(process.env.TTS_UPSTREAM_CHUNK_CHARS);
  if (Number.isInteger(configured) && configured >= 600) {
    return Math.min(5000, configured);
  }
  return fallback;
}

function estimateMaxGenerateLength(text: string, mode: GenerationMode): number {
  const charCount = Array.from(text).length;
  const charsPerSecond = mode === "clone" ? 13 : 20;
  const paddingSeconds = mode === "clone" ? 4 : 2;
  const targetSeconds = Math.max(
    5,
    Math.ceil(charCount / charsPerSecond) + paddingSeconds,
  );
  const tokensPerSecond = readNumericEnv(
    "TTS_MAX_GENERATE_TOKENS_PER_SECOND",
    9,
    4,
    20,
  );
  const hardMax =
    mode === "clone"
      ? readNumericEnv("TTS_CLONE_MAX_GENERATE_LENGTH", 1600, 100, 8192)
      : readNumericEnv("TTS_MAX_GENERATE_LENGTH", 2400, 100, 8192);

  return Math.min(
    hardMax,
    Math.max(100, Math.ceil(targetSeconds * tokensPerSecond)),
  );
}

function inferWavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) break;

    if (chunkId === "fmt " && chunkSize >= 16) {
      byteRate = buffer.readUInt32LE(dataOffset + 8);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) return null;
  const duration = dataSize / byteRate;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.toString("ascii", 0, 3) === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

// Detects an empty / header-only WAV: a valid RIFF/WAVE container whose `data`
// chunk carries no audio samples (e.g. the ~78-byte "RIFF....WAVEfmt ...LIST...
// data[ffffffff]" the upstream sometimes returns when a generation produced no
// audio). This is an upstream blip, not a format problem, so it should be
// surfaced as a retryable "no audio" error rather than the misleading
// "format not supported" message.
function isEmptyOrHeaderOnlyWav(bytes: Uint8Array): boolean {
  if (!looksLikeWav(bytes)) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const declaredSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkId === "data") {
      const remaining = buffer.length - chunkDataOffset;
      // 0xFFFFFFFF (or any value past the buffer) means "rest of buffer"; the
      // real payload is `remaining`. Fewer than 2 bytes = no PCM-16 samples.
      const actual = declaredSize > remaining ? remaining : declaredSize;
      return actual < 2;
    }
    if (chunkDataOffset + declaredSize > buffer.length) break;
    offset = chunkDataOffset + declaredSize + (declaredSize % 2);
  }
  // No data chunk at all → also empty.
  return true;
}

function upstreamEmptyAudioMessage(): string {
  return "Upstream returned no audio for this segment. Please try again.";
}

type Pcm16WavInfo = {
  channels: 1 | 2;
  sampleRate: number;
  durationSeconds: number | null;
  dataOffset: number;
  dataSize: number;
};

const WAV_FORMAT_PCM = 0x0001;
const WAV_FORMAT_EXTENSIBLE = 0xfffe;
const WAV_EXTENSIBLE_PCM_SUBFORMAT = "0100000000001000800000aa00389b71";

function isPcm16WavFormat(params: {
  audioFormat: number;
  bitsPerSample: number;
  fmtChunk: Buffer | null;
}): boolean {
  if (params.bitsPerSample !== 16) return false;
  if (params.audioFormat === WAV_FORMAT_PCM) return true;
  if (
    params.audioFormat !== WAV_FORMAT_EXTENSIBLE ||
    !params.fmtChunk ||
    params.fmtChunk.length < 40
  ) {
    return false;
  }

  // WAVE_FORMAT_EXTENSIBLE stores the real codec in a 16-byte SubFormat GUID
  // at byte 24 of the fmt chunk. FFmpeg may emit this wrapper even for PCM.
  return (
    params.fmtChunk.subarray(24, 40).toString("hex").toLowerCase() ===
    WAV_EXTENSIBLE_PCM_SUBFORMAT
  );
}

function readPcm16Wav(bytes: Uint8Array): Pcm16WavInfo {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!looksLikeWav(bytes)) {
    throw new TtsProviderError(
      "Upstream returned non-WAV audio that cannot be converted to MP3.",
      502,
    );
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let fmtChunk: Buffer | null = null;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = buffer.readUInt16LE(chunkDataOffset);
      channels = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
      fmtChunk = buffer.subarray(
        chunkDataOffset,
        Math.min(buffer.length, chunkDataOffset + chunkSize),
      );
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      // When FFmpeg streams WAV to a non-seekable pipe it cannot backfill the
      // data chunk size and writes a placeholder (0xFFFFFFFF) or a value that
      // overruns the actual buffer. In that case the real payload is simply the
      // rest of the buffer. Clamp instead of trusting the declared size, which
      // otherwise made the loop break and report an unsupported format.
      const remaining = buffer.length - chunkDataOffset;
      dataSize = chunkSize > remaining ? remaining : chunkSize;
      // data is the last meaningful chunk for our purposes; stop scanning so a
      // clamped size doesn't get advanced past the buffer.
      break;
    }

    if (chunkDataOffset + chunkSize > buffer.length) break;
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (
    !isPcm16WavFormat({ audioFormat, bitsPerSample, fmtChunk }) ||
    (channels !== 1 && channels !== 2) ||
    sampleRate <= 0 ||
    dataSize <= 0
  ) {
    throw new TtsProviderError(
      "Upstream WAV format is not supported for MP3 conversion.",
      502,
    );
  }

  const sampleCount = Math.floor(dataSize / 2 / channels);

  return {
    channels: channels as 1 | 2,
    sampleRate,
    durationSeconds: sampleCount > 0 ? sampleCount / sampleRate : null,
    dataOffset,
    dataSize,
  };
}

function resolveFfmpegExecutable(): string {
  const envPath = process.env.FFMPEG_BIN?.trim();
  if (envPath) return envPath;
  if (process.platform === "win32") {
    return "node_modules/ffmpeg-static/ffmpeg.exe";
  }
  return "ffmpeg";
}

async function runFfmpeg(
  args: string[],
  input?: Uint8Array,
): Promise<Uint8Array> {
  const executable = resolveFfmpegExecutable();

  return await new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      reject(
        new TtsProviderError(
          `FFmpeg MP3 conversion could not start: ${error.message}`,
          502,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(new Uint8Array(Buffer.concat(stdout)));
        return;
      }
      const message = Buffer.concat(stderr)
        .toString("utf8")
        .trim()
        .slice(0, 260);
      reject(
        new TtsProviderError(
          message || `FFmpeg MP3 conversion failed with exit code ${code}.`,
          502,
        ),
      );
    });
    if (input) {
      child.stdin.end(Buffer.from(input));
    } else {
      child.stdin.end();
    }
  });
}

async function runFfmpegCollectStderr(
  args: string[],
  input?: Uint8Array,
): Promise<string> {
  const executable = resolveFfmpegExecutable();

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const stderr: Buffer[] = [];
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      reject(
        new TtsProviderError(
          `FFmpeg analysis could not start: ${error.message}`,
          502,
        ),
      );
    });
    child.on("close", (code) => {
      const text = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(text);
        return;
      }
      reject(
        new TtsProviderError(
          text.trim().slice(0, 260) ||
            `FFmpeg analysis failed with exit code ${code}.`,
          502,
        ),
      );
    });
    if (input) {
      child.stdin.end(Buffer.from(input));
    } else {
      child.stdin.end();
    }
  });
}

async function capLongPauses(bytes: Uint8Array): Promise<Uint8Array> {
  if (!readBooleanEnv("TTS_OUTPUT_PAUSE_CAP", true)) {
    return bytes;
  }
  const maxPause = readNumericEnv("TTS_OUTPUT_MAX_PAUSE_SECONDS", 0.7, 0.3, 3);
  const keepPause = Math.min(
    maxPause,
    readNumericEnv("TTS_OUTPUT_KEEP_PAUSE_SECONDS", 0.4, 0.1, 2),
  );
  const thresholdDb = readNumericEnv(
    "TTS_OUTPUT_PAUSE_THRESHOLD_DB",
    -45,
    -70,
    -20,
  );

  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    // Decode whatever we merged (MP3) to mono PCM16 so pause handling is exact.
    const pcmBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "s16le",
        "pipe:1",
      ],
      bytes,
    );
    const pcm = Buffer.from(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      pcmBytes.byteLength,
    );
    const totalSamples = Math.floor(pcm.length / 2);
    if (totalSamples === 0) return bytes;

    const threshold = dbToAmplitude(thresholdDb);
    const maxPauseSamples = Math.round(maxPause * sampleRate);
    const keepPauseSamples = Math.round(keepPause * sampleRate);
    // Detect quiet runs on a small window so we don't chop mid-syllable.
    const win = Math.max(1, Math.round(sampleRate * 0.02)); // 20ms

    const keptRanges: Array<[number, number]> = [];
    let runStart = -1; // start sample of current quiet run
    let cursor = 0; // start of the not-yet-emitted speech region

    function windowIsQuiet(start: number): boolean {
      const end = Math.min(totalSamples, start + win);
      let sum = 0;
      let n = 0;
      for (let i = start; i < end; i++) {
        const v = pcm.readInt16LE(i * 2);
        sum += v * v;
        n++;
      }
      return n > 0 && Math.sqrt(sum / n) < threshold;
    }

    for (let s = 0; s < totalSamples; s += win) {
      if (windowIsQuiet(s)) {
        if (runStart < 0) runStart = s;
      } else if (runStart >= 0) {
        const runEnd = s; // exclusive
        if (runEnd - runStart > maxPauseSamples) {
          // Emit speech up to the quiet run plus only keepPause of the silence.
          keptRanges.push([cursor, runStart + keepPauseSamples]);
          cursor = runEnd;
        }
        runStart = -1;
      }
    }
    // Trailing quiet run (e.g. long tail) gets capped too.
    if (runStart >= 0 && totalSamples - runStart > maxPauseSamples) {
      keptRanges.push([cursor, runStart + keepPauseSamples]);
      cursor = totalSamples;
    }
    keptRanges.push([cursor, totalSamples]);

    // Nothing to trim: return original to avoid a needless re-encode.
    const keptSamples = keptRanges.reduce(
      (acc, [a, b]) => acc + Math.max(0, b - a),
      0,
    );
    if (keptSamples >= totalSamples) {
      return bytes;
    }

    const out = Buffer.alloc(keptSamples * 2);
    let offset = 0;
    for (const [a, b] of keptRanges) {
      const start = Math.max(0, a) * 2;
      const end = Math.min(totalSamples, b) * 2;
      if (end > start) {
        pcm.copy(out, offset, start, end);
        offset += end - start;
      }
    }

    const wav = createPcm16Wav(out, 1, sampleRate);
    return wav.byteLength > 0 ? wav : bytes;
  } catch {
    // Pause capping is a finishing touch; never fail delivery over it.
    return bytes;
  }
}

// Final whole-file loudness normalization for delivered audio. This is the one
// place we intentionally raise/even out volume: VoxCPM2 output is naturally
// quiet (~-29 LUFS) and can fade within a long passage, so we normalize the
// fully merged audio to a consistent target with a true-peak limiter. It is
// volume only (no EQ, no tone shaping) and uses two passes so the gain is
// applied cleanly without pumping. Disabled with TTS_OUTPUT_LOUDNORM=false.
// Optional speech-safe broadband denoise applied to the merged audio BEFORE
// loudness normalization. VoxCPM2 output carries a low-level texture/noise that
// the loudnorm boost (~13 dB up to the -16 LUFS target) lifts into audible
// background noise during quiet passages. Running afftdn first deepens the true
// silent gaps and shaves the inter-word floor while leaving the speech band
// essentially untouched (measured: speech RMS moved <0.3 dB at nr=24). It runs
// before loudnorm so the floor is lowered prior to amplification. Off by
// default (TTS_OUTPUT_DENOISE=false) so existing behavior is unchanged until
// opted in; tune strength with TTS_OUTPUT_DENOISE_NR (dB of reduction).
async function reduceOutputNoise(bytes: Uint8Array): Promise<Uint8Array> {
  if (!readBooleanEnv("TTS_OUTPUT_DENOISE", true)) {
    return bytes;
  }
  const noiseReduction = readNumericEnv("TTS_OUTPUT_DENOISE_NR", 14, 0.01, 97);
  const noiseFloor = readNumericEnv("TTS_OUTPUT_DENOISE_NF", -30, -80, -20);
  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const output = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-af",
        `afftdn=nr=${noiseReduction}:nf=${noiseFloor}:tn=1`,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      bytes,
    );
    return output.byteLength > 0 ? output : bytes;
  } catch {
    // Denoise is a finishing touch; never fail delivery over it.
    return bytes;
  }
}

async function normalizeOutputLoudness(bytes: Uint8Array): Promise<Uint8Array> {
  if (!readBooleanEnv("TTS_OUTPUT_LOUDNORM", true)) {
    return bytes;
  }
  const targetI = readNumericEnv("TTS_OUTPUT_LOUDNORM_I", -16, -36, -8);
  const targetTp = readNumericEnv("TTS_OUTPUT_LOUDNORM_TP", -1.5, -9, -0.5);
  const targetLra = readNumericEnv("TTS_OUTPUT_LOUDNORM_LRA", 11, 1, 20);
  const base = `loudnorm=I=${targetI}:TP=${targetTp}:LRA=${targetLra}`;

  try {
    // Pass 1: measure the merged file's real loudness.
    const stderr = await runFfmpegCollectStderr(
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        "pipe:0",
        "-af",
        `${base}:print_format=json`,
        "-f",
        "null",
        "-",
      ],
      bytes,
    );
    const jsonMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
    if (!jsonMatch) return bytes;
    const measured = JSON.parse(jsonMatch[0]) as Record<string, string>;
    const keys = [
      "input_i",
      "input_tp",
      "input_lra",
      "input_thresh",
      "target_offset",
    ];
    if (
      !keys.every(
        (k) => typeof measured[k] === "string" && measured[k].length > 0,
      )
    ) {
      return bytes;
    }

    // Pass 2: apply linear gain from the measured values, with the true-peak
    // limiter preventing clipping. No EQ is applied at any point.
    const applyFilter =
      `${base}` +
      `:measured_I=${measured.input_i}` +
      `:measured_TP=${measured.input_tp}` +
      `:measured_LRA=${measured.input_lra}` +
      `:measured_thresh=${measured.input_thresh}` +
      `:offset=${measured.target_offset}` +
      `:linear=true`;
    const output = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-af",
        applyFilter,
        "-ac",
        "1",
        "-ar",
        String(readCanonicalGeneratedSampleRate()),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      bytes,
    );
    return output.byteLength > 0 ? output : bytes;
  } catch {
    // Loudness normalization is a finishing touch; never fail delivery over it.
    return bytes;
  }
}

// Optional pitch-preserving talking-speed adjustment for the delivered audio.
// VoxCPM2 clones inherit the reference sample's rhythm, which can be too fast
// (sentences run together with almost no breathing pauses). atempo changes the
// tempo WITHOUT changing pitch, so the cloned voice identity is preserved.
// Values below 1.0 slow speech down; above 1.0 speed it up. 1.0 is a no-op and
// returns the original bytes (no re-encode). Clone output reads
// TTS_OUTPUT_CLONE_TEMPO first, then falls back to the global TTS_OUTPUT_TEMPO;
// standard TTS reads TTS_OUTPUT_TEMPO only. Defaults are 1.0 (off) so existing
// behavior is unchanged until a value is configured. Runs last, after pause
// capping and loudness normalization, so those time-based steps stay
// predictable. Disabled entirely with TTS_OUTPUT_TEMPO_ENABLED=false.
function readOutputTempo(mode: GenerationMode): number {
  const global = readNumericEnv("TTS_OUTPUT_TEMPO", 1.0, 0.5, 2.0);
  if (mode === "clone") {
    // Clone-specific override wins when set; otherwise inherit the global tempo.
    const cloneRaw = process.env.TTS_OUTPUT_CLONE_TEMPO?.trim();
    if (cloneRaw) {
      return readNumericEnv("TTS_OUTPUT_CLONE_TEMPO", global, 0.5, 2.0);
    }
  }
  return global;
}

async function applyOutputTempo(
  bytes: Uint8Array,
  mode: GenerationMode,
): Promise<Uint8Array> {
  if (!readBooleanEnv("TTS_OUTPUT_TEMPO_ENABLED", true)) {
    return bytes;
  }
  const tempo = readOutputTempo(mode);
  // Treat near-1.0 as a no-op to avoid a needless re-encode and tiny artifacts.
  if (!Number.isFinite(tempo) || Math.abs(tempo - 1.0) < 0.005) {
    return bytes;
  }

  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const output = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-af",
        `atempo=${tempo.toFixed(3)}`,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      bytes,
    );
    return output.byteLength > 0 ? output : bytes;
  } catch {
    // Tempo is a finishing touch; never fail delivery over it.
    return bytes;
  }
}

function amplitudeToDb(value: number): number {
  if (value <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(value / 32768);
}

function dbToAmplitude(db: number): number {
  return 32768 * Math.pow(10, db / 20);
}

function getSteadyTonalStats(
  windowRmsValues: number[],
  windowZeroCrossingRates: number[],
  windowSeconds: number,
  tonalMinDbOverride?: number,
): { ratio: number; longestSeconds: number } {
  if (
    windowRmsValues.length === 0 ||
    windowRmsValues.length !== windowZeroCrossingRates.length
  ) {
    return { ratio: 0, longestSeconds: 0 };
  }

  const groupSeconds = readNumericEnv(
    "TTS_AUDIO_TONAL_GROUP_SECONDS",
    1,
    0.5,
    3,
  );
  const groupWindows = Math.max(
    2,
    Math.round(groupSeconds / Math.max(0.01, windowSeconds)),
  );
  if (windowRmsValues.length < groupWindows) {
    return { ratio: 0, longestSeconds: 0 };
  }

  // The tonal RMS floor is the only gain-dependent gate in this detector
  // (envelope CV, average/peak ZCR are all ratios/rates, independent of level).
  // Callers analyzing raw upstream audio that will later be boosted by the
  // delivery loudnorm pass an override floor so a buzz which only becomes
  // audible AFTER amplification is still flagged at the chunk level.
  const minRms = dbToAmplitude(
    typeof tonalMinDbOverride === "number"
      ? tonalMinDbOverride
      : readNumericEnv("TTS_AUDIO_TONAL_MIN_DB", -22, -40, -8),
  );
  const maxEnvelopeCv = readNumericEnv(
    "TTS_AUDIO_TONAL_MAX_ENVELOPE_CV",
    0.18,
    0.03,
    1,
  );
  const minAverageZcr = readNumericEnv(
    "TTS_AUDIO_TONAL_MIN_AVG_ZCR",
    0.07,
    0.01,
    0.4,
  );
  const minPeakZcr = readNumericEnv(
    "TTS_AUDIO_TONAL_MIN_PEAK_ZCR",
    0.1,
    0.02,
    0.6,
  );

  let tonalGroups = 0;
  let totalGroups = 0;
  let currentTonalGroups = 0;
  let longestTonalGroups = 0;

  for (let index = 0; index + groupWindows <= windowRmsValues.length; index++) {
    const rmsGroup = windowRmsValues.slice(index, index + groupWindows);
    const zcrGroup = windowZeroCrossingRates.slice(index, index + groupWindows);
    const meanRms =
      rmsGroup.reduce((sum, value) => sum + value, 0) / rmsGroup.length;
    const variance =
      rmsGroup.reduce((sum, value) => sum + (value - meanRms) ** 2, 0) /
      rmsGroup.length;
    const envelopeCv = Math.sqrt(variance) / Math.max(1, meanRms);
    const averageZcr =
      zcrGroup.reduce((sum, value) => sum + value, 0) / zcrGroup.length;
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
    // A run of N consecutive tonal group-starts spans N-1+groupWindows windows
    // of real audio. Counting only the starts under-reported every burst by
    // groupSeconds-windowSeconds (~0.75s), which let real ~3.25s stuck-vowel
    // sections pass a 2.5s threshold.
    longestSeconds:
      longestTonalGroups > 0
        ? (longestTonalGroups - 1 + groupWindows) * windowSeconds
        : 0,
  };
}

type WavPcm16Stats = {
  rms: number;
  peak: number;
  durationSeconds: number | null;
  rmsDb: number;
  peakDb: number;
  lowWindowRatio: number;
  longestLowSeconds: number;
  trailingLowSeconds: number;
  highZeroCrossingWindowRatio: number;
  longestHighZeroCrossingSeconds: number;
  maximumZeroCrossingRate: number;
  steadyTonalWindowRatio: number;
  longestSteadyTonalSeconds: number;
  highDominantFreqWindowRatio: number;
  longestHighDominantFreqSeconds: number;
};

function getWavPcm16Stats(
  bytes: Uint8Array,
  tonalMinDbOverride?: number,
): WavPcm16Stats | null {
  if (bytes.byteLength < 44 || !looksLikeWav(bytes)) return null;

  let info: Pcm16WavInfo;
  try {
    info = readPcm16Wav(bytes);
  } catch {
    return null;
  }

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(buffer.length, info.dataOffset + info.dataSize);
  const totalSamples = Math.floor((end - info.dataOffset) / 2);
  if (totalSamples <= 0) return null;

  const lowThreshold = dbToAmplitude(
    readNumericEnv("TTS_AUDIO_LOW_WINDOW_DB", -45, -70, -25),
  );
  const windowSeconds = readNumericEnv(
    "TTS_AUDIO_ANALYSIS_WINDOW_SECONDS",
    0.25,
    0.05,
    1,
  );
  const samplesPerWindow = Math.max(
    1,
    Math.round(info.sampleRate * info.channels * windowSeconds),
  );
  const highZeroCrossingThreshold = readNumericEnv(
    "TTS_AUDIO_HIGH_ZCR_THRESHOLD",
    0.42,
    0.15,
    0.9,
  );

  let sumSquares = 0;
  let peak = 0;
  let samples = 0;
  let windowSumSquares = 0;
  let windowSamples = 0;
  let windowZeroCrossings = 0;
  let previousWindowSample = 0;
  let hasPreviousWindowSample = false;
  let lowWindows = 0;
  let totalWindows = 0;
  let currentLowWindows = 0;
  let longestLowWindows = 0;
  let trailingLowWindows = 0;
  let highZeroCrossingWindows = 0;
  let currentHighZeroCrossingWindows = 0;
  let longestHighZeroCrossingWindows = 0;
  let maximumZeroCrossingRate = 0;
  const windowRmsValues: number[] = [];
  const windowZeroCrossingRates: number[] = [];
  // High-dominant-frequency ("machine buzz") detection. VoxCPM2 occasionally
  // emits a sustained ~1-3 kHz tone that sounds like a harsh mechanical sound.
  // It has a NORMAL zero-crossing rate (so the ZCR detector above misses it)
  // but is spectrally wrong for speech. The discriminator is the variation of
  // the inter-zero-crossing intervals: a pure high tone has very regular
  // intervals (low coefficient of variation) AND a high fundamental frequency,
  // while speech has irregular intervals with a low fundamental. Validated
  // against real generated audio: clean speech scores CV~1.0 / ~390 Hz, the
  // machine-buzz artifact scores CV~0.47 / ~1800 Hz.
  const buzzMaxCv = readNumericEnv(
    "TTS_AUDIO_BUZZ_MAX_CV",
    0.6,
    0.2,
    1.2,
  );
  const buzzMinFreqHz = readNumericEnv(
    "TTS_AUDIO_BUZZ_MIN_FREQ_HZ",
    800,
    400,
    2000,
  );
  let highDominantFreqWindows = 0;
  let currentHighDominantFreqWindows = 0;
  let longestHighDominantFreqWindows = 0;
  // Per-window state for dominant-period (CV + fundamental) estimation.
  let lastZeroCrossingSampleIndex = -1;
  let intervalSum = 0;
  let intervalSumSquares = 0;
  let intervalCount = 0;

  function flushWindow(): void {
    if (windowSamples === 0) return;
    const windowRms = Math.sqrt(windowSumSquares / windowSamples);
    const isLow = windowRms < lowThreshold;
    const zeroCrossingRate =
      windowZeroCrossings / Math.max(1, windowSamples - 1);
    const isHighZeroCrossing =
      !isLow && zeroCrossingRate >= highZeroCrossingThreshold;
    windowRmsValues.push(windowRms);
    windowZeroCrossingRates.push(zeroCrossingRate);
    totalWindows += 1;
    // Machine-buzz: low CV of crossing intervals (regular period) AND a high
    // fundamental frequency. Need enough intervals for a stable estimate.
    let isHighDominantFreq = false;
    if (!isLow && intervalCount >= 8 && intervalSum > 0) {
      const meanInterval = intervalSum / intervalCount;
      if (meanInterval >= 1) {
        const variance =
          Math.max(0, intervalSumSquares / intervalCount - meanInterval * meanInterval);
        const cv = Math.sqrt(variance) / meanInterval;
        const fundamentalHz = info.sampleRate / (2 * meanInterval);
        isHighDominantFreq = cv < buzzMaxCv && fundamentalHz > buzzMinFreqHz;
      }
    }
    if (isLow) {
      lowWindows += 1;
      currentLowWindows += 1;
      trailingLowWindows += 1;
      longestLowWindows = Math.max(longestLowWindows, currentLowWindows);
    } else {
      currentLowWindows = 0;
      trailingLowWindows = 0;
    }
    if (isHighZeroCrossing) {
      highZeroCrossingWindows += 1;
      currentHighZeroCrossingWindows += 1;
      longestHighZeroCrossingWindows = Math.max(
        longestHighZeroCrossingWindows,
        currentHighZeroCrossingWindows,
      );
    } else {
      currentHighZeroCrossingWindows = 0;
    }
    if (isHighDominantFreq) {
      highDominantFreqWindows += 1;
      currentHighDominantFreqWindows += 1;
      longestHighDominantFreqWindows = Math.max(
        longestHighDominantFreqWindows,
        currentHighDominantFreqWindows,
      );
    } else {
      currentHighDominantFreqWindows = 0;
    }
    maximumZeroCrossingRate = Math.max(
      maximumZeroCrossingRate,
      zeroCrossingRate,
    );
    windowSumSquares = 0;
    windowSamples = 0;
    windowZeroCrossings = 0;
    previousWindowSample = 0;
    hasPreviousWindowSample = false;
    lastZeroCrossingSampleIndex = -1;
    intervalSum = 0;
    intervalSumSquares = 0;
    intervalCount = 0;
  }

  for (let index = info.dataOffset; index + 1 < end; index += 2) {
    const value = buffer.readInt16LE(index);
    const abs = Math.abs(value);
    const square = value * value;
    peak = Math.max(peak, abs);
    sumSquares += square;
    samples += 1;
    windowSumSquares += square;
    windowSamples += 1;
    if (
      hasPreviousWindowSample &&
      value !== 0 &&
      previousWindowSample !== 0 &&
      value > 0 !== previousWindowSample > 0
    ) {
      windowZeroCrossings += 1;
      // Accumulate inter-crossing interval stats for the dominant-period
      // (CV + fundamental) machine-buzz detector above.
      if (lastZeroCrossingSampleIndex >= 0) {
        const interval = samples - lastZeroCrossingSampleIndex;
        intervalSum += interval;
        intervalSumSquares += interval * interval;
        intervalCount += 1;
      }
      lastZeroCrossingSampleIndex = samples;
    }
    previousWindowSample = value;
    hasPreviousWindowSample = true;
    if (windowSamples >= samplesPerWindow) {
      flushWindow();
    }
  }
  flushWindow();

  if (samples === 0) return null;
  const rms = Math.sqrt(sumSquares / samples);
  const lowWindowRatio = totalWindows > 0 ? lowWindows / totalWindows : 0;
  const lowWindowSeconds =
    samplesPerWindow / Math.max(1, info.sampleRate * info.channels);
  const steadyTonal = getSteadyTonalStats(
    windowRmsValues,
    windowZeroCrossingRates,
    lowWindowSeconds,
    tonalMinDbOverride,
  );

  return {
    rms,
    peak,
    durationSeconds: info.durationSeconds,
    rmsDb: amplitudeToDb(rms),
    peakDb: amplitudeToDb(peak),
    lowWindowRatio,
    longestLowSeconds: longestLowWindows * lowWindowSeconds,
    trailingLowSeconds: trailingLowWindows * lowWindowSeconds,
    highZeroCrossingWindowRatio:
      totalWindows > 0 ? highZeroCrossingWindows / totalWindows : 0,
    longestHighZeroCrossingSeconds:
      longestHighZeroCrossingWindows * lowWindowSeconds,
    maximumZeroCrossingRate,
    steadyTonalWindowRatio: steadyTonal.ratio,
    longestSteadyTonalSeconds: steadyTonal.longestSeconds,
    highDominantFreqWindowRatio:
      totalWindows > 0 ? highDominantFreqWindows / totalWindows : 0,
    longestHighDominantFreqSeconds:
      longestHighDominantFreqWindows * lowWindowSeconds,
  };
}

function nearSilentAudioMessage(): string {
  // Standard preset TTS is synthesized in clone mode under the hood, so the
  // provider layer can't reliably tell "bad reference sample" from "unlucky
  // generation". Keep the guidance generic and actionable for both.
  return "Upstream generated near-silent audio. Please try again, or slightly rephrase that part of the text.";
}

function generatedAudioSilenceIssue(stats: WavPcm16Stats): string | null {
  const maxLowWindowRatio = readNumericEnv(
    "TTS_AUDIO_MAX_LOW_WINDOW_RATIO",
    0.85,
    0.2,
    0.98,
  );
  const maxLongSilenceSeconds = readNumericEnv(
    "TTS_AUDIO_MAX_LONG_SILENCE_SECONDS",
    10,
    2,
    30,
  );
  const maxTrailingSilenceSeconds = readNumericEnv(
    "TTS_AUDIO_MAX_TRAILING_SILENCE_SECONDS",
    4,
    0.5,
    15,
  );

  if ((stats.durationSeconds ?? 0) < 0.2) {
    return "audio is too short";
  }
  if (stats.rms < 80 && stats.peak < 1200) {
    return `very low level (rms ${stats.rmsDb.toFixed(1)} dB, peak ${stats.peakDb.toFixed(1)} dB)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 3 &&
    stats.lowWindowRatio > maxLowWindowRatio
  ) {
    return `mostly quiet (${Math.round(stats.lowWindowRatio * 100)}% low-level windows)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 3 &&
    stats.trailingLowSeconds > maxTrailingSilenceSeconds
  ) {
    return `contains a long quiet tail (${stats.trailingLowSeconds.toFixed(1)}s)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 8 &&
    stats.longestLowSeconds > maxLongSilenceSeconds
  ) {
    return `contains a long silent section (${stats.longestLowSeconds.toFixed(1)}s)`;
  }

  return null;
}

function generatedAudioStatsIssue(stats: WavPcm16Stats): string | null {
  const maxHighZeroCrossingRatio = readNumericEnv(
    "TTS_AUDIO_MAX_HIGH_ZCR_RATIO",
    0.18,
    0.02,
    0.8,
  );
  const maxHighZeroCrossingSeconds = readNumericEnv(
    "TTS_AUDIO_MAX_HIGH_ZCR_SECONDS",
    1,
    0.25,
    5,
  );
  // Stuck-vowel buzz bursts from VoxCPM2 are typically 1-2s each. The old
  // 2.5s threshold (further weakened by the duration under-count fixed in
  // getSteadyTonalStats) let chunks full of 1-1.75s buzz sections through to
  // the final MP3. Reject earlier so the retry/temperature-bump path can
  // regenerate the chunk instead of delivering buzzing audio.
  // 2026-06-25: relaxed 1.0 → 1.4 because retried chunks at 0.7 temperature
  // produce ~1.2s stuck-tonal runs that pass the audio but get rejected on
  // the first attempt, cascading into batch-item failures ("2 of 4 failed").
  const maxSteadyTonalSeconds = readNumericEnv(
    "TTS_AUDIO_MAX_STEADY_TONAL_SECONDS",
    1.4,
    0.75,
    10,
  );
  const maxSteadyTonalRatio = readNumericEnv(
    "TTS_AUDIO_MAX_STEADY_TONAL_RATIO",
    0.12,
    0.05,
    0.8,
  );

  const silenceIssue = generatedAudioSilenceIssue(stats);
  if (silenceIssue) return silenceIssue;
  if (
    (stats.durationSeconds ?? 0) >= 2 &&
    stats.longestHighZeroCrossingSeconds > maxHighZeroCrossingSeconds
  ) {
    return `contains sustained non-speech noise (${stats.longestHighZeroCrossingSeconds.toFixed(1)}s)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 4 &&
    stats.highZeroCrossingWindowRatio > maxHighZeroCrossingRatio
  ) {
    return `contains too much high-frequency noise (${Math.round(stats.highZeroCrossingWindowRatio * 100)}% of windows)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 4 &&
    stats.longestSteadyTonalSeconds > maxSteadyTonalSeconds
  ) {
    return `contains a sustained stuck tonal section (${stats.longestSteadyTonalSeconds.toFixed(1)}s)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 8 &&
    stats.steadyTonalWindowRatio > maxSteadyTonalRatio
  ) {
    return `contains too much stuck tonal audio (${Math.round(stats.steadyTonalWindowRatio * 100)}% of windows)`;
  }
  // Sustained high-frequency pure tone ("machine buzz"): VoxCPM2 occasionally
  // emits a 1-3 kHz tone that reads as a normal zero-crossing rate but is
  // audibly a harsh mechanical sound. Reject any chunk with a long run of it
  // so the silence-retry path regenerates the chunk.
  // 2026-06-25: relaxed 0.5 → 0.9 to match the same root-cause fix as
  // maxSteadyTonalSeconds — high-frequency buzz often co-occurs with stuck
  // tonal runs and we don't want a chunk to fail on the first attempt.
  const maxHighDominantFreqSeconds = readNumericEnv(
    "TTS_AUDIO_MAX_HIGH_DOMINANT_FREQ_SECONDS",
    0.9,
    0.25,
    5,
  );
  const maxHighDominantFreqRatio = readNumericEnv(
    "TTS_AUDIO_MAX_HIGH_DOMINANT_FREQ_RATIO",
    0.12,
    0.03,
    0.8,
  );
  if (
    (stats.durationSeconds ?? 0) >= 2 &&
    stats.longestHighDominantFreqSeconds > maxHighDominantFreqSeconds
  ) {
    return `contains a sustained high-frequency tone (${stats.longestHighDominantFreqSeconds.toFixed(1)}s)`;
  }
  if (
    (stats.durationSeconds ?? 0) >= 4 &&
    stats.highDominantFreqWindowRatio > maxHighDominantFreqRatio
  ) {
    return `contains too much high-frequency tone (${Math.round(stats.highDominantFreqWindowRatio * 100)}% of windows)`;
  }

  return null;
}

function readChunkTonalDeliveryBoostDb(): number {
  return readNumericEnv("TTS_AUDIO_TONAL_DELIVERY_BOOST_DB", 0, 0, 24);
}

function chunkTonalMinDbOverride(): number | undefined {
  const boostDb = readChunkTonalDeliveryBoostDb();
  if (boostDb <= 0) return undefined;
  const baseMinDb = readNumericEnv("TTS_AUDIO_TONAL_MIN_DB", -22, -40, -8);
  return baseMinDb - boostDb;
}

async function analyzeRawGeneratedAudioSilence(
  bytes: Uint8Array,
  contentType: string,
): Promise<{ issue: string | null; durationSeconds: number | null }> {
  const tonalMinDbOverride = chunkTonalMinDbOverride();
  let stats: WavPcm16Stats | null = null;

  if (contentType.toLowerCase().includes("wav") || looksLikeWav(bytes)) {
    stats = getWavPcm16Stats(bytes, tonalMinDbOverride);
  }

  if (!stats) {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const pcmBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "s16le",
        "pipe:1",
      ],
      bytes,
    );
    if (pcmBytes.byteLength < 2) {
      return { issue: "decoded audio is empty", durationSeconds: null };
    }
    const wavBytes = createPcm16Wav(
      Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength),
      1,
      sampleRate,
    );
    stats = getWavPcm16Stats(wavBytes, tonalMinDbOverride);
  }

  if (!stats) {
    return {
      issue: "generated audio could not be analyzed",
      durationSeconds: null,
    };
  }

  return {
    issue: generatedAudioStatsIssue(stats),
    durationSeconds: stats.durationSeconds,
  };
}

function inferAudioDurationSeconds(
  bytes: Uint8Array,
  contentType: string,
): number | null {
  if (contentType.toLowerCase().includes("wav") || looksLikeWav(bytes)) {
    return inferWavDurationSeconds(bytes);
  }
  return null;
}

async function normalizeToPublicFormat(
  bytes: Uint8Array,
  contentType: string,
  outputSeconds: number | null,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  outputSeconds: number | null;
}> {
  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType.includes("wav") || looksLikeWav(bytes)) {
    return {
      bytes,
      contentType: PUBLIC_AUDIO_CONTENT_TYPE,
      outputSeconds,
    };
  }

  if (
    lowerContentType.includes("mp3") ||
    lowerContentType.includes("mpeg") ||
    looksLikeMp3(bytes)
  ) {
    const wavBytes = await decodeAudioToCanonicalWav(bytes);
    return {
      bytes: wavBytes,
      contentType: PUBLIC_AUDIO_CONTENT_TYPE,
      outputSeconds: outputSeconds,
    };
  }

  throw new TtsProviderError(
    "Upstream returned an audio format that cannot be converted to WAV.",
    502,
  );
}

export async function cleanPublicMp3ForDelivery(
  bytes: Uint8Array,
  outputSeconds: number | null,
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  outputSeconds: number | null;
}> {
  return normalizeToPublicFormat(
    bytes,
    looksLikeWav(bytes) ? "audio/wav" : PUBLIC_AUDIO_CONTENT_TYPE,
    outputSeconds,
  );
}

async function measureDeliveredAudioDurationSeconds(
  bytes: Uint8Array,
  contentType: string,
): Promise<number | null> {
  const inferred = inferAudioDurationSeconds(bytes, contentType);
  if (inferred !== null) return inferred;

  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const pcmBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "s16le",
        "pipe:1",
      ],
      bytes,
    );
    const sampleCount = Math.floor(pcmBytes.byteLength / 2);
    if (sampleCount <= 0) return null;
    return sampleCount / sampleRate;
  } catch {
    return null;
  }
}

// Decode any supported audio bytes (e.g. legacy MP3 from before the WAV switch)
// to canonical mono PCM-16 WAV without running silence/quality filters. Used
// when a stored segment is MP3 but public output must be WAV.
async function decodeAudioToCanonicalWav(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const sampleRate = readCanonicalGeneratedSampleRate();
  const pcmBytes = await runFfmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-codec:a",
      "pcm_s16le",
      "-sample_fmt",
      "s16",
      "-f",
      "s16le",
      "pipe:1",
    ],
    bytes,
  );
  if (pcmBytes.byteLength < 2) {
    throw new TtsProviderError("Audio could not be decoded to WAV.", 502);
  }
  return createPcm16Wav(
    Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength),
    1,
    sampleRate,
  );
}

async function normalizeSegmentVolumes(
  segments: Uint8Array[],
): Promise<Uint8Array[]> {
  if (segments.length <= 1) return segments;

  if (!readBooleanEnv("TTS_OUTPUT_VOLUME_MATCH", true)) {
    return segments;
  }

  try {
    // Measure RMS of each segment
    const rmsValues: number[] = [];
    for (const segment of segments) {
      const rms = await measureSegmentRms(segment);
      rmsValues.push(rms);
    }

    // Target strategy:
    // - Default: median RMS across segments (good when most segments are
    //   well-produced and we just need to fix outliers).
    // - "fixed" mode: target a known LUFS-equivalent so volume matches across
    //   *batches*, not just within a batch. Set TTS_OUTPUT_VOLUME_TARGET_LUFS
    //   to a negative dBFS number (e.g. -16) and it will be used as the
    //   reference instead of the median.
    const sortedRms = [...rmsValues].sort((a, b) => a - b);
    const medianRms = sortedRms[Math.floor(sortedRms.length / 2)];
    const targetLufs = readNumericEnv(
      "TTS_OUTPUT_VOLUME_TARGET_LUFS",
      0,
      -36,
      -8,
    );
    const targetRms =
      targetLufs < -8
        ? Math.pow(10, targetLufs / 20) // linear RMS equivalent
        : medianRms;

    const maxGainDb = readNumericEnv(
      "TTS_OUTPUT_VOLUME_MAX_GAIN_DB",
      6,
      0,
      18,
    );

    // Adjust each segment to match target RMS
    const normalizedSegments: Uint8Array[] = [];
    for (let i = 0; i < segments.length; i++) {
      const currentRms = rmsValues[i];
      if (currentRms <= 0 || targetRms <= 0) {
        normalizedSegments.push(segments[i]);
        continue;
      }

      const gainDb = 20 * Math.log10(targetRms / currentRms);
      const clampedGainDb = Math.max(
        -maxGainDb,
        Math.min(maxGainDb, gainDb),
      );

      if (Math.abs(clampedGainDb) < 0.25) {
        // Gain change is too small, skip processing
        normalizedSegments.push(segments[i]);
        continue;
      }

      const adjusted = await applySegmentGain(segments[i], clampedGainDb);
      normalizedSegments.push(adjusted);
    }

    return normalizedSegments;
  } catch (error) {
    // If normalization fails, return original segments
    console.warn("[tts-provider] Segment volume normalization failed:", error);
    return segments;
  }
}

/**
 * Measure RMS (loudness) of an audio segment using ffmpeg volumedetect.
 * Works on any input container (WAV/MP3) the way ffmpeg is invoked here.
 */
async function measureSegmentRms(segmentBytes: Uint8Array): Promise<number> {
  try {
    const stderr = await runFfmpegCollectStderr(
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        "pipe:0",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      segmentBytes,
    );

    // Parse mean_volume from ffmpeg output
    const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    if (meanMatch) {
      return Math.pow(10, parseFloat(meanMatch[1]) / 20);
    }

    // Fallback: measure RMS directly
    const rmsMatch = stderr.match(
      /\[Parsed_volumedetect_0.*?\] n_samples:\s*(\d+)/,
    );
    if (rmsMatch) {
      return 1.0; // Default RMS if parsing fails
    }

    return 1.0;
  } catch {
    return 1.0;
  }
}

/**
 * Apply gain adjustment to a segment, re-encoding to canonical mono PCM-16 WAV
 * so public output stays WAV (never MP3).
 */
async function applySegmentGain(
  segmentBytes: Uint8Array,
  gainDb: number,
): Promise<Uint8Array> {
  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const output = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-af",
        `volume=${gainDb.toFixed(1)}dB`,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
      ],
      segmentBytes,
    );
    return output.byteLength > 0 ? output : segmentBytes;
  } catch {
    return segmentBytes;
  }
}

export async function mergePublicMp3SegmentsForDelivery(
  buffers: Uint8Array[],
  outputSeconds: number | null,
  mode: GenerationMode = "tts",
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  outputSeconds: number | null;
}> {
  if (buffers.length === 0) {
    throw new TtsProviderError(
      "No audio segments were available to merge.",
      502,
    );
  }

  // Public output is WAV. Normalize each segment to WAV (freshly generated
  // segments are already WAV; legacy stored MP3 is decoded back to WAV), then
  // join the raw PCM payloads under a single WAV header.
  const publicSegments: Uint8Array[] = [];
  let summedSeconds = 0;
  let hasSummedSeconds = false;

  for (const buffer of buffers) {
    const segmentContentType = looksLikeWav(buffer)
      ? "audio/wav"
      : PUBLIC_AUDIO_CONTENT_TYPE;
    const inferredSeconds = inferAudioDurationSeconds(
      buffer,
      segmentContentType,
    );
    const normalized = await normalizeToPublicFormat(
      buffer,
      segmentContentType,
      inferredSeconds,
    );
    publicSegments.push(normalized.bytes);
    if (
      typeof normalized.outputSeconds === "number" &&
      Number.isFinite(normalized.outputSeconds) &&
      normalized.outputSeconds > 0
    ) {
      summedSeconds += normalized.outputSeconds;
      hasSummedSeconds = true;
    }
  }

  // Normalize volume across segments before merging
  // This ensures consistent loudness across all segments
  const volumeNormalizedSegments =
    await normalizeSegmentVolumes(publicSegments);

  // All segments are now PCM-16 WAV (normalizeToPublicFormat decoded any legacy
  // MP3 above). Use the smart concat that crossfades audible mid-phrase seams
  // and pads quiet sentence boundaries with a short pause, instead of a plain
  // data-segment splice which can audibly click at chunk joins.
  const merged = concatPcm16WavBuffers(volumeNormalizedSegments);
  const depaused = await capLongPauses(merged);
  const denoised = await reduceOutputNoise(depaused);
  const normalized = await normalizeOutputLoudness(denoised);
  const paced = await applyOutputTempo(normalized, mode);
  return {
    bytes: finalizeDeliveredWav(paced),
    contentType: PUBLIC_AUDIO_CONTENT_TYPE,
    outputSeconds: outputSeconds ?? (hasSummedSeconds ? summedSeconds : null),
  };
}

export function splitTextIntoChunks(
  text: string,
  maxChunkChars = 400,
): string[] {
  maxChunkChars = Math.max(1, Math.floor(maxChunkChars));
  const charCount = Array.from(text).length;
  if (charCount <= maxChunkChars) {
    const trimmed = text.trim();
    return hasSpeakableText(trimmed) ? [trimmed] : [];
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = 0;

  // Split by newlines first to preserve paragraph breaks
  const paragraphs = text.split(/\r?\n/);

  for (const para of paragraphs) {
    const paraClean = para.trim();
    if (!paraClean) continue;

    const paraChars = Array.from(paraClean);
    if (paraChars.length + currentLen <= maxChunkChars) {
      if (currentChunk.length > 0) {
        currentChunk.push("\n");
      }
      currentChunk.push(paraClean);
      currentLen += paraChars.length + (currentChunk.length > 1 ? 1 : 0);
    } else {
      // Flush current chunk if any
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(""));
        currentChunk = [];
        currentLen = 0;
      }

      // If the paragraph itself is small enough, start a new chunk with it
      if (paraChars.length <= maxChunkChars) {
        currentChunk.push(paraClean);
        currentLen = paraChars.length;
      } else {
        // We need to split the paragraph by sentence boundaries or spaces
        // Split on spoken sentence endings. Khmer full stop is \u17d4.
        const sentences = paraClean.split(/(?<=[\u17d4.!?])\s*/u);
        for (const sentence of sentences) {
          const sentenceClean = sentence.trim();
          if (!sentenceClean) continue;

          const sentenceChars = Array.from(sentenceClean);
          if (sentenceChars.length + currentLen <= maxChunkChars) {
            if (currentChunk.length > 0) {
              currentChunk.push(" ");
            }
            currentChunk.push(sentenceClean);
            currentLen +=
              sentenceChars.length + (currentChunk.length > 1 ? 1 : 0);
          } else {
            // Flush current chunk if any
            if (currentChunk.length > 0) {
              chunks.push(currentChunk.join(""));
              currentChunk = [];
              currentLen = 0;
            }

            // If the sentence is still too long, split it by spaces
            if (sentenceChars.length <= maxChunkChars) {
              currentChunk.push(sentenceClean);
              currentLen = sentenceChars.length;
            } else {
              const words = sentenceClean.split(/\s+/);
              for (const word of words) {
                const wordClean = word.trim();
                if (!wordClean) continue;

                const wordChars = Array.from(wordClean);
                if (wordChars.length + currentLen <= maxChunkChars) {
                  if (currentChunk.length > 0) {
                    currentChunk.push(" ");
                  }
                  currentChunk.push(wordClean);
                  currentLen +=
                    wordChars.length + (currentChunk.length > 1 ? 1 : 0);
                } else {
                  // Flush current chunk if any
                  if (currentChunk.length > 0) {
                    chunks.push(currentChunk.join(""));
                    currentChunk = [];
                    currentLen = 0;
                  }

                  // If word is still too long (rare), split by character length
                  if (wordChars.length <= maxChunkChars) {
                    currentChunk.push(wordClean);
                    currentLen = wordChars.length;
                  } else {
                    let wordIndex = 0;
                    while (wordIndex < wordChars.length) {
                      const sliceChars = wordChars.slice(
                        wordIndex,
                        wordIndex + maxChunkChars,
                      );
                      chunks.push(sliceChars.join(""));
                      wordIndex += maxChunkChars;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(""));
  }

  return chunks
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      const chars = Array.from(trimmed);
      if (chars.length <= maxChunkChars) return trimmed ? [trimmed] : [];

      const pieces: string[] = [];
      for (let index = 0; index < chars.length; index += maxChunkChars) {
        const piece = chars
          .slice(index, index + maxChunkChars)
          .join("")
          .trim();
        if (piece) pieces.push(piece);
      }
      return pieces;
    })
    .reduce<string[]>((normalized, chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return normalized;
      if (hasSpeakableText(trimmed)) {
        normalized.push(trimmed);
        return normalized;
      }

      // A hard character split can leave a final Khmer full stop or quote by
      // itself. Attach that punctuation to the previous spoken chunk when it is
      // only a tiny overflow; otherwise drop it instead of asking VoxCPM2 to
      // synthesize punctuation-only "speech".
      const previous = normalized[normalized.length - 1];
      if (previous) {
        const previousLen = Array.from(previous).length;
        const punctuationLen = Array.from(trimmed).length;
        if (
          punctuationLen <= 12 &&
          previousLen + punctuationLen <= maxChunkChars + 12
        ) {
          normalized[normalized.length - 1] = `${previous}${trimmed}`;
        }
      }
      return normalized;
    }, []);
}

function createPcm16Wav(
  data: Buffer,
  channels: 1 | 2,
  sampleRate: number,
): Uint8Array {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);

  return new Uint8Array(Buffer.concat([header, data]));
}

// FFmpeg streams WAV to a non-seekable stdout pipe in the final delivery
// filters (capLongPauses, reduceOutputNoise, normalizeOutputLoudness,
// applyOutputTempo), so it cannot seek back to backfill the RIFF and `data`
// chunk size fields and leaves placeholders (0xFFFFFFFF). The app's own WAV
// readers clamp this, but external consumers (audio editors, browser duration
// readouts, ASR pipelines) trust the declared sizes and see a malformed or
// wrongly-sized file. Rebuild a clean canonical PCM-16 WAV header with correct
// sizes before public delivery. Already-correct WAVs are returned untouched.
function finalizeDeliveredWav(bytes: Uint8Array): Uint8Array {
  if (!looksLikeWav(bytes)) return bytes;
  let info: Pcm16WavInfo;
  try {
    info = readPcm16Wav(bytes);
  } catch {
    return bytes;
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataEnd = Math.min(buffer.length, info.dataOffset + info.dataSize);
  const data = buffer.subarray(info.dataOffset, dataEnd);

  // Fast path: canonical 44-byte header already present with correct sizes and
  // no extra chunks (data immediately after fmt). Avoid a needless copy.
  if (
    info.dataOffset === 44 &&
    buffer.readUInt32LE(4) === 36 + data.length &&
    buffer.readUInt32LE(40) === data.length
  ) {
    return bytes;
  }
  return createPcm16Wav(data, info.channels, info.sampleRate);
}

/** Soft fade-in at chunk heads after continuation prompts to avoid hard cuts. */
function applyWavHeadFadeIn(bytes: Uint8Array, fadeMs: number): Uint8Array {
  if (fadeMs <= 0) return bytes;
  let info: Pcm16WavInfo;
  try {
    info = readPcm16Wav(bytes);
  } catch {
    return bytes;
  }
  const bytesPerFrame = info.channels * 2;
  const totalFrames = Math.floor(info.dataSize / bytesPerFrame);
  const fadeFrames = Math.min(
    Math.round((info.sampleRate * fadeMs) / 1000),
    Math.floor(totalFrames / 4),
  );
  if (fadeFrames <= 0) return bytes;

  const out = Buffer.from(bytes);
  for (let frame = 0; frame < fadeFrames; frame++) {
    const gain = (frame + 1) / fadeFrames;
    const frameOffset = info.dataOffset + frame * bytesPerFrame;
    for (let channel = 0; channel < info.channels; channel++) {
      const sampleOffset = frameOffset + channel * 2;
      if (sampleOffset + 1 >= out.length) continue;
      const value = out.readInt16LE(sampleOffset);
      out.writeInt16LE(Math.round(value * gain), sampleOffset);
    }
  }
  return out;
}

// Concatenates multiple PCM-16 WAV buffers into one WAV by joining their raw
// PCM payloads and writing a single fresh header. All inputs must share the
// same sample rate and channel count (the canonical mono 24 kHz format the
// generated-audio cleanup produces), otherwise the merge is rejected — the
// same guarantee the old MP3 path gave via concatMp3Buffers' "different
// formats" guard. Non-WAV inputs are decoded to canonical WAV first.
function estimateWavSpeechRms(bytes: Uint8Array): number | null {
  let info: Pcm16WavInfo;
  try {
    info = readPcm16Wav(bytes);
  } catch {
    return null;
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataEnd = Math.min(buffer.length, info.dataOffset + info.dataSize);
  const bytesPerFrame = info.channels * 2;
  const windowFrames = Math.max(1, Math.round(info.sampleRate * 0.05)); // 50 ms
  const windowBytes = windowFrames * bytesPerFrame;
  const floor = dbToAmplitude(
    readNumericEnv("TTS_CHUNK_LEVEL_FLOOR_DB", -45, -70, -20),
  );

  let speechSumSquares = 0;
  let speechSamples = 0;
  for (
    let windowStart = info.dataOffset;
    windowStart < dataEnd;
    windowStart += windowBytes
  ) {
    const windowEnd = Math.min(dataEnd, windowStart + windowBytes);
    let sumSquares = 0;
    let count = 0;
    for (let index = windowStart; index + 1 < windowEnd; index += 2) {
      const value = buffer.readInt16LE(index);
      sumSquares += value * value;
      count += 1;
    }
    if (count === 0) continue;
    const rms = Math.sqrt(sumSquares / count);
    if (rms >= floor) {
      speechSumSquares += sumSquares;
      speechSamples += count;
    }
  }
  return speechSamples > 0 ? Math.sqrt(speechSumSquares / speechSamples) : null;
}

// Independently generated chunks come back at slightly different levels, so
// long audio drifts louder/quieter from one chunk to the next. This aligns each
// PCM16 WAV chunk to the median chunk loudness using a capped *linear gain*
// only (no EQ, no compression, no mastering), preserving the raw VoxCPM2 tone
// while keeping the whole file at one consistent volume. Non-WAV chunks and
// single-chunk audio are returned unchanged.
function levelWavChunksToCommonLoudness(chunks: Uint8Array[]): Uint8Array[] {
  if (!readBooleanEnv("TTS_CHUNK_LEVEL_MATCH", true) || chunks.length < 2) {
    return chunks;
  }

  const levels = chunks.map(estimateWavSpeechRms);
  const measurable = levels
    .filter((value): value is number => typeof value === "number" && value > 0)
    .sort((a, b) => a - b);
  if (measurable.length === 0) {
    return chunks;
  }
  const reference = measurable[Math.floor(measurable.length / 2)]; // median level
  if (reference <= 0) {
    return chunks;
  }

  const maxGainDb = readNumericEnv("TTS_CHUNK_LEVEL_MAX_GAIN_DB", 6, 0, 18);
  return chunks.map((chunk, index) => {
    const level = levels[index];
    if (!level || level <= 0) return chunk;
    const clampedGainDb = Math.max(
      -maxGainDb,
      Math.min(maxGainDb, 20 * Math.log10(reference / level)),
    );
    if (Math.abs(clampedGainDb) < 0.25) return chunk;
    const gain = Math.pow(10, clampedGainDb / 20);

    let info: Pcm16WavInfo;
    try {
      info = readPcm16Wav(chunk);
    } catch {
      return chunk;
    }
    const out = Buffer.from(chunk);
    const dataEnd = Math.min(out.length, info.dataOffset + info.dataSize);
    for (let i = info.dataOffset; i + 1 < dataEnd; i += 2) {
      const scaled = Math.round(out.readInt16LE(i) * gain);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), i);
    }
    return out;
  });
}

function concatPcm16WavBuffers(buffers: Uint8Array[]): Uint8Array {
  if (buffers.length === 0) return new Uint8Array();
  if (buffers.length === 1) return buffers[0];

  const infos = buffers.map((buffer) => readPcm16Wav(buffer));
  const first = infos[0];
  for (const info of infos.slice(1)) {
    if (
      info.channels !== first.channels ||
      info.sampleRate !== first.sampleRate
    ) {
      throw new TtsProviderError(
        "Upstream WAV chunks use different formats and cannot be merged.",
        502,
      );
    }
  }

  // Long-form chunks may split either at a real sentence pause or in the middle
  // of a long Khmer phrase. Quiet boundaries get a short pause; audible
  // boundaries are crossfaded so they do not sound like a hard cut.
  const crossfadeMs = readNumericEnv("TTS_CHUNK_CROSSFADE_MS", 45, 0, 250);
  const joinSilenceMs = readNumericEnv("TTS_CHUNK_JOIN_SILENCE_MS", 70, 0, 500);
  const joinEdgeWindowMs = readNumericEnv(
    "TTS_CHUNK_JOIN_EDGE_WINDOW_MS",
    60,
    10,
    250,
  );
  const joinQuietDb = readNumericEnv("TTS_CHUNK_JOIN_QUIET_DB", -42, -70, -20);
  const joinSilenceFrames = Math.round(
    (first.sampleRate * joinSilenceMs) / 1000,
  );
  const joinSilence =
    joinSilenceFrames > 0
      ? Buffer.alloc(joinSilenceFrames * first.channels * 2)
      : null;

  let rawSegments = buffers.map((buffer, index) => {
    const info = infos[index];
    const source = Buffer.from(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    return Buffer.from(
      source.subarray(info.dataOffset, info.dataOffset + info.dataSize),
    );
  });

  // Chunks are generated independently, so their average level can drift a few
  // dB from one to the next. Listeners hear that drift as "uneven" long audio.
  // Align each segment's RMS to the median segment level (gain capped) before
  // joining, so the final loudnorm pass gets consistent input.
  if (
    readBooleanEnv("TTS_CHUNK_LOUDNESS_MATCH", true) &&
    rawSegments.length > 1
  ) {
    const rmsValues = rawSegments.map((segment) => {
      let sumSquares = 0;
      const samples = Math.floor(segment.length / 2);
      for (let index = 0; index + 1 < segment.length; index += 2) {
        const value = segment.readInt16LE(index);
        sumSquares += value * value;
      }
      return samples > 0 ? Math.sqrt(sumSquares / samples) : 0;
    });
    const audible = rmsValues
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (audible.length > 0) {
      const median = audible[Math.floor(audible.length / 2)];
      const maxGainDb = readNumericEnv(
        "TTS_CHUNK_LOUDNESS_MAX_GAIN_DB",
        3,
        0,
        12,
      );
      rawSegments = rawSegments.map((segment, index) => {
        const rms = rmsValues[index];
        if (rms <= 0 || median <= 0) return segment;
        const gainDb = Math.max(
          -maxGainDb,
          Math.min(maxGainDb, 20 * Math.log10(median / rms)),
        );
        if (Math.abs(gainDb) < 0.25) return segment;
        const gain = Math.pow(10, gainDb / 20);
        const adjusted = Buffer.from(segment);
        for (let offset = 0; offset + 1 < adjusted.length; offset += 2) {
          const value = Math.round(adjusted.readInt16LE(offset) * gain);
          adjusted.writeInt16LE(
            Math.max(-32768, Math.min(32767, value)),
            offset,
          );
        }
        return adjusted;
      });
    }
  }

  const bytesPerFrame = first.channels * 2;

  function pcmWindowDb(
    segment: Buffer,
    startFrame: number,
    frameCount: number,
  ): number {
    const totalFrames = Math.floor(segment.length / bytesPerFrame);
    const start = Math.max(0, Math.min(totalFrames, startFrame));
    const end = Math.max(start, Math.min(totalFrames, start + frameCount));
    let sumSquares = 0;
    let samples = 0;
    for (let frame = start; frame < end; frame++) {
      const frameOffset = frame * bytesPerFrame;
      for (let channel = 0; channel < first.channels; channel++) {
        const value = segment.readInt16LE(frameOffset + channel * 2);
        sumSquares += value * value;
        samples += 1;
      }
    }
    return samples > 0
      ? amplitudeToDb(Math.sqrt(sumSquares / samples))
      : Number.NEGATIVE_INFINITY;
  }

  function isQuietEdge(segment: Buffer, edge: "head" | "tail"): boolean {
    const totalFrames = Math.floor(segment.length / bytesPerFrame);
    const windowFrames = Math.min(
      totalFrames,
      Math.round((first.sampleRate * joinEdgeWindowMs) / 1000),
    );
    if (windowFrames <= 0) return true;
    const startFrame = edge === "head" ? 0 : totalFrames - windowFrames;
    return pcmWindowDb(segment, startFrame, windowFrames) <= joinQuietDb;
  }

  // Applies only the fade needed at the current seam. Fading both ends of the
  // accumulated buffer on every append gradually dulls the first syllable and
  // can make joins sound more abrupt than the source chunks.
  function applyDeclickFade(
    segment: Buffer,
    options: { fadeIn?: boolean; fadeOut?: boolean },
  ): Buffer {
    const declickMs = readNumericEnv("TTS_CHUNK_JOIN_DECLICK_MS", 10, 0, 40);
    const declickFrames = Math.min(
      Math.round((first.sampleRate * declickMs) / 1000),
      Math.floor(Math.floor(segment.length / bytesPerFrame) / 4),
    );
    if (declickFrames <= 0) return segment;
    const out = Buffer.from(segment);
    const totalFrames = Math.floor(out.length / bytesPerFrame);
    for (let frame = 0; frame < declickFrames; frame++) {
      const fadeInGain = (frame + 1) / declickFrames;
      const fadeOutGain = (declickFrames - frame) / declickFrames;
      const startOffset = frame * bytesPerFrame;
      const endOffset = (totalFrames - declickFrames + frame) * bytesPerFrame;
      for (let channel = 0; channel < first.channels; channel++) {
        const channelOffset = channel * 2;
        if (options.fadeIn) {
          const startValue = out.readInt16LE(startOffset + channelOffset);
          out.writeInt16LE(
            Math.round(startValue * fadeInGain),
            startOffset + channelOffset,
          );
        }
        if (options.fadeOut) {
          const endValue = out.readInt16LE(endOffset + channelOffset);
          out.writeInt16LE(
            Math.round(endValue * fadeOutGain),
            endOffset + channelOffset,
          );
        }
      }
    }
    return out;
  }

  function joinSegments(left: Buffer, right: Buffer): Buffer {
    // Pause mode only when both sides are already quiet, which usually means
    // the split landed on a real phrase/sentence boundary. Mid-phrase splits
    // stay gapless and are overlap-blended below.
    if (
      joinSilence &&
      joinSilence.length > 0 &&
      isQuietEdge(left, "tail") &&
      isQuietEdge(right, "head")
    ) {
      return Buffer.concat([
        applyDeclickFade(left, { fadeOut: true }),
        joinSilence,
        applyDeclickFade(right, { fadeIn: true }),
      ]);
    }

    // Gapless mode: overlap-blend audible seams so hard chunk splits do not
    // become audible stop/start cuts.
    const leftFrames = Math.floor(left.length / bytesPerFrame);
    const rightFrames = Math.floor(right.length / bytesPerFrame);
    const fadeFrames = Math.min(
      Math.round((first.sampleRate * crossfadeMs) / 1000),
      Math.floor(leftFrames / 3),
      Math.floor(rightFrames / 3),
    );
    if (fadeFrames <= 0) {
      return Buffer.concat([left, right]);
    }

    const overlapBytes = fadeFrames * bytesPerFrame;
    const crossfaded = Buffer.alloc(overlapBytes);
    const leftStart = left.length - overlapBytes;

    for (let frame = 0; frame < fadeFrames; frame++) {
      const t = (frame + 1) / (fadeFrames + 1);
      const leftGain = Math.cos((t * Math.PI) / 2);
      const rightGain = Math.sin((t * Math.PI) / 2);
      const outFrameOffset = frame * bytesPerFrame;
      const leftFrameOffset = leftStart + outFrameOffset;
      for (let channel = 0; channel < first.channels; channel++) {
        const channelOffset = channel * 2;
        const leftSample = left.readInt16LE(leftFrameOffset + channelOffset);
        const rightSample = right.readInt16LE(outFrameOffset + channelOffset);
        const mixed = Math.round(
          leftSample * leftGain + rightSample * rightGain,
        );
        crossfaded.writeInt16LE(
          Math.max(-32768, Math.min(32767, mixed)),
          outFrameOffset + channelOffset,
        );
      }
    }

    return Buffer.concat([
      left.subarray(0, left.length - overlapBytes),
      crossfaded,
      right.subarray(overlapBytes),
    ]);
  }

  let data: Buffer = rawSegments[0];
  for (let index = 1; index < rawSegments.length; index++) {
    data = joinSegments(data, rawSegments[index]);
  }

  return createPcm16Wav(data, first.channels, first.sampleRate);
}

// VoxCPM2 failures are sticky at low temperature: resending the identical
// payload tends to reproduce the same near-silent result. Each quality retry
// raises temperature slightly so the model samples a different trajectory.
function retryAdjustedTemperature(
  baseTemperature: number,
  qualityRetryAttempt: number,
): number {
  if (qualityRetryAttempt <= 0) return baseTemperature;
  // Default 0.15 per retry, capped at 1.0 so we don't blow past official range.
  const step = readNumericEnv("TTS_RETRY_TEMPERATURE_STEP", 0.15, 0, 0.5);
  const max = readNumericEnv("TTS_RETRY_TEMPERATURE_MAX", 1.0, 0.3, 2.0);
  return Math.min(max, baseTemperature + step * qualityRetryAttempt);
}

// VoxCPM2's own docs note that when long-form output turns noisy or buzzy,
// lowering cfg_value (toward ~1.5-1.6) is often more stable than holding it at
// the 2.0 default. The per-chunk silence/buzz retry path already escalates
// temperature; this complements it by *decreasing* CFG on each retry so a
// stuck-tonal chunk is regenerated with looser guidance. The reduction is
// floored so guidance never collapses entirely. Disabled by default
// (TTS_RETRY_CFG_STEP=0) so existing behavior is unchanged until opted in.
function retryAdjustedCfg(
  baseCfg: number,
  qualityRetryAttempt: number,
): number {
  if (qualityRetryAttempt <= 0) return baseCfg;
  // Default 0.2 so each retry steps CFG down toward the 1.5 floor — official
  // VoxCPM2 docs recommend lowering CFG to 1.5–1.6 when long-form output turns
  // buzzy. step=0 keeps the old "don't change CFG on retry" behavior.
  const step = readNumericEnv("TTS_RETRY_CFG_STEP", 0.2, 0, 1);
  if (step <= 0) return baseCfg;
  const floor = readNumericEnv("TTS_RETRY_CFG_MIN", 1.5, 0.5, 2.0);
  return Math.max(floor, baseCfg - step * qualityRetryAttempt);
}

// Runs an async task over `items` with at most `concurrency` in flight at once,
// preserving input order in the returned results. Used to generate independent
// text chunks against the upstream endpoint pool in parallel instead of strictly
// one-at-a-time, which is the dominant latency cost for long-form audio. When
// concurrency is 1 this behaves exactly like the previous sequential loop.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  if (limit === 1 || items.length <= 1) {
    const sequential: R[] = [];
    for (let index = 0; index < items.length; index++) {
      sequential.push(await worker(items[index], index));
    }
    return sequential;
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }
  const runnerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: runnerCount }, () => runWorker()));
  return results;
}

// Resolves how many chunks to generate concurrently. Defaults to the number of
// configured upstream endpoints (so we never pile multiple requests onto one
// GPU), capped to a sane ceiling. TTS_CHUNK_CONCURRENCY overrides explicitly;
// set it to 1 to force the original strictly-sequential behavior.
function resolveChunkConcurrency(): number {
  const configured = process.env.TTS_CHUNK_CONCURRENCY?.trim();
  const ceiling = readIntegerEnv("TTS_CHUNK_CONCURRENCY_MAX", 6, 1, 16);
  if (configured) {
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(ceiling, Math.floor(parsed));
    }
  }
  const poolSize = getUpstreamEndpoints().length;
  return Math.min(ceiling, Math.max(1, poolSize));
}

type ChunkContinuationPrompt = {
  wavBytes: Uint8Array;
  text: string;
};

function chunkContinuationEnabled(): boolean {
  // Off by default: the 2026-06-24 continuation experiment (prompt_wav between
  // chunks) caused cut/buzz regressions vs parallel ref-clone chunks. Opt in
  // with TTS_CHUNK_CONTINUATION=true when testing long-form style carry-over.
  return readBooleanEnv("TTS_CHUNK_CONTINUATION", false);
}

function continuationPromptSeconds(): number {
  return readNumericEnv("TTS_CONTINUATION_PROMPT_SECONDS", 6, 2, 15);
}

function extractWavTailBytes(wavBytes: Uint8Array, tailSeconds: number): Uint8Array {
  const info = readPcm16Wav(wavBytes);
  const buffer = Buffer.from(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const dataEnd = Math.min(buffer.length, info.dataOffset + info.dataSize);
  const pcm = buffer.subarray(info.dataOffset, dataEnd);
  const bytesPerSecond = info.sampleRate * info.channels * 2;
  const tailBytes = Math.min(
    pcm.length,
    Math.max(bytesPerSecond, Math.round(tailSeconds * bytesPerSecond)),
  );
  const tailPcm = pcm.subarray(pcm.length - tailBytes);
  return createPcm16Wav(tailPcm, info.channels, info.sampleRate);
}

function tailTextForContinuation(
  chunkText: string,
  tailSeconds: number,
  charsPerSecond: number,
): string {
  const trimmed = chunkText.trim();
  if (!trimmed) return trimmed;
  const maxChars = Math.max(24, Math.round(tailSeconds * charsPerSecond));
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return trimmed;
  const slice = chars.slice(-maxChars).join("");
  const boundary = slice.search(/(?:^|[\s\u17d4.!?])([^\s\u17d4.!?].*)$/u);
  if (boundary >= 0) {
    const adjusted = slice.slice(boundary).replace(/^[\s\u17d4.!?]+/u, "").trim();
    if (adjusted.length >= Math.min(12, Math.floor(maxChars / 3))) {
      return adjusted;
    }
  }
  return slice.trim();
}

async function synthesizeSingleChunk(
  params: {
    mode: GenerationMode;
    text: string;
    voice: string;
    model?: string;
    cloneSample?: CloneSample;
    denoiseReference?: boolean;
    continuationPrompt?: ChunkContinuationPrompt;
  },
  model: string,
  responseFormat: AudioResponseFormat,
  expectedContentType: string,
  qualityRetryAttempt = 0,
): Promise<{
  audioBytes: Uint8Array;
  contentType: string;
  upstreamRequestId: string | null;
  durationSeconds: number | null;
  endpointUrl: string;
}> {
  // Official VoxCPM2 ref-clone contract (modal/modal_voxcpm_api.py):
  // - input: Khmer text only (no English voice tags prepended)
  // - ref_audio_wav_base64: timbre from reference WAV (preset male/female or clone)
  // - optional prompt_wav_base64 + prompt_text: chunk continuation (long text)
  // - temperature, cfg_value, max_generate_length
  // Never send `voice` with ref_audio unless TTS_CLONE_USE_VOICE_DESCRIPTION=true
  // on a user-uploaded clone (upstream prepends voice to speakable text).
  const payload: Record<string, unknown> = {
    model,
    input: params.text,
    response_format: responseFormat,
    max_generate_length: estimateMaxGenerateLength(params.text, params.mode),
  };

  // Optional upstream text normalization (expands numbers, dates, etc. so they
  // are spoken as words instead of digit-by-digit). Off by default because the
  // app already runs prepareTextForSpeech(); enable with TTS_UPSTREAM_NORMALIZE.
  if (readBooleanEnv("TTS_UPSTREAM_NORMALIZE", false)) {
    payload.normalize = true;
  }

  if (params.cloneSample) {
    const normalizedSample = await normalizeCloneSampleForUpstream(
      params.cloneSample,
    );
    const base64 = Buffer.from(normalizedSample.bytes).toString("base64");
    payload.ref_audio_wav_base64 = base64;
    payload.ref_audio_wav_format = "wav";

    if (params.continuationPrompt?.wavBytes.byteLength && params.continuationPrompt.text.trim()) {
      payload.prompt_wav_base64 = Buffer.from(params.continuationPrompt.wavBytes).toString(
        "base64",
      );
      payload.prompt_wav_format = "wav";
      payload.prompt_text = params.continuationPrompt.text.trim();
    }

    if (
      params.mode === "clone" &&
      !isPresetReferenceSample(params.cloneSample)
    ) {
      // VoxCPM2 ZipEnhancer reference denoise. On by default for preset ref
      // clips and user clone samples — the reference tracks used here are
      // captured in real environments and contain broadband background noise
      // that leaks into every generation. opt-out with
      // TTS_UPSTREAM_DENOISE=false if you ever feed a studio-clean ref.
      if (readBooleanEnv("TTS_UPSTREAM_DENOISE", true)) {
        payload.denoise = true;
      }
      // Optional voice description (off by default). Official ref-clone uses
      // ref_audio_wav_base64; voice is only sent when TTS_CLONE_USE_VOICE_DESCRIPTION=true.
      const voiceDescription = upstreamVoiceDescriptionForClone(params.voice);
      if (voiceDescription) {
        payload.voice = voiceDescription;
      } else {
        delete payload.voice;
      }
      payload.temperature = retryAdjustedTemperature(
        readNumericEnv("TTS_CLONE_TEMPERATURE", 0.7, 0.1, 2.0),
        qualityRetryAttempt,
      );
      // CFG (guidance scale): official VoxCPM2 default is 2.0. The docs recommend
      // reducing to 1.5-1.6 for unstable long-form output, but 2.0 is the
      // standard for normal clone requests. On buzz/silence retries, CFG can be
      // stepped DOWN toward TTS_RETRY_CFG_MIN when TTS_RETRY_CFG_STEP is set.
      payload.cfg_value = retryAdjustedCfg(
        readNumericEnv("TTS_CLONE_CFG_VALUE", 2.0, 0.1, 2.0),
        qualityRetryAttempt,
      );
    } else {
      // Preset male/female: ref_audio only (official). Never send voice — upstream
      // prepends it to speakable text as "(male)…" / "(female)…" and the model
      // reads the English label aloud on every chunk.
      delete payload.voice;
      payload.temperature = retryAdjustedTemperature(
        readNumericEnv("TTS_PRESET_TEMPERATURE", 0.7, 0.1, 2.0),
        qualityRetryAttempt,
      );
      // CFG (guidance scale): official VoxCPM2 default is 2.0.
      // Higher CFG = more faithful to reference audio = more consistent voice.
      payload.cfg_value = retryAdjustedCfg(
        readNumericEnv("TTS_PRESET_CFG_VALUE", 2.0, 0.1, 2.0),
        qualityRetryAttempt,
      );
    }
  }

  const pool = getUpstreamEndpoints();
  if (pool.length === 0) {
    throw new TtsProviderError(
      "TTS upstream is not configured. Set TTS_UPSTREAM_POOL or TTS_UPSTREAM_URL in environment.",
      503,
    );
  }

  const maxAttempts = Math.max(1, pool.length);
  let lastError: Error | null = null;
  const attemptedUrls = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let endpoint: UpstreamEndpoint;
    try {
      endpoint = selectEndpoint();
    } catch (err) {
      throw err;
    }

    // Prevent looping on the same url in one chunk request if possible
    if (attemptedUrls.has(endpoint.url) && attemptedUrls.size < pool.length) {
      const untried = pool.find((ep) => !attemptedUrls.has(ep.url));
      if (untried) endpoint = untried;
    }
    attemptedUrls.add(endpoint.url);

    const startTime = Date.now();
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (endpoint.token) {
        headers.Authorization = `Bearer ${endpoint.token}`;
      }

      const timeoutMs = readNumericEnv(
        "TTS_UPSTREAM_TIMEOUT_MS",
        180000,
        30000,
        600000,
      );
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs), // configurable; default 180s to absorb slow GPU cold starts
      });

      const upstreamRequestId = response.headers.get("x-request-id");
      if (!response.ok) {
        let message = `Upstream TTS failed (${response.status})`;
        try {
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            message = upstreamErrorMessage(await response.json(), message);
          } else {
            const text = await response.text();
            if (text.trim()) {
              message = text.slice(0, 240);
            }
          }
        } catch {
          // Ignore
        }

        recordMetric(
          endpoint.url,
          params.text.length,
          Date.now() - startTime,
          false,
        );

        // If it's a client parameter error, throw immediately. A 400/422 is a
        // payload problem that will fail identically on every endpoint, so
        // failing over wastes time and credits.
        if (response.status === 400 || response.status === 422) {
          throw new TtsProviderError(message, response.status);
        }

        // 401/403 are endpoint-specific auth problems (one account's token is
        // wrong/expired), and 402/429/5xx are endpoint-specific availability
        // problems. Disable this endpoint and fail over to the next account in
        // the pool instead of failing the whole request.
        disableEndpoint(endpoint.url, `HTTP ${response.status}: ${message}`);
        throw new TtsProviderError(message, response.status);
      }

      const responseContentType = response.headers.get("content-type");
      const isJson = responseContentType
        ?.toLowerCase()
        .includes("application/json");

      if (isJson) {
        const data = (await response.json()) as Record<string, unknown>;
        const base64 =
          (typeof data.audio_base64 === "string" && data.audio_base64) ||
          (typeof data.audioBase64 === "string" && data.audioBase64) ||
          (typeof data.audio === "string" && data.audio) ||
          (typeof data.data === "string" && data.data);

        if (!base64) {
          throw new TtsProviderError(
            "Upstream returned JSON but no audio payload.",
            502,
          );
        }

        const contentType =
          (typeof data.content_type === "string" && data.content_type) ||
          (typeof data.mime_type === "string" && data.mime_type) ||
          expectedContentType;

        const audioBytes = Buffer.from(base64, "base64");
        const normalizedContentType = normalizeContentType(
          contentType,
          expectedContentType,
        );

        if (isEmptyOrHeaderOnlyWav(audioBytes)) {
          recordMetric(
            endpoint.url,
            params.text.length,
            Date.now() - startTime,
            false,
          );
          throw new TtsProviderError(upstreamEmptyAudioMessage(), 502);
        }

        const durationSeconds =
          asNumberOrNull(data.duration_seconds) ??
          asNumberOrNull(data.audio_duration_seconds) ??
          asNumberOrNull(data.duration) ??
          asNumberOrNull(data.durationSeconds);

        recordMetric(
          endpoint.url,
          params.text.length,
          Date.now() - startTime,
          true,
        );

        return {
          audioBytes,
          contentType: normalizedContentType,
          upstreamRequestId,
          durationSeconds,
          endpointUrl: endpoint.url,
        };
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new TtsProviderError("Upstream returned empty audio data.", 502);
      }
      if (isEmptyOrHeaderOnlyWav(bytes)) {
        recordMetric(
          endpoint.url,
          params.text.length,
          Date.now() - startTime,
          false,
        );
        throw new TtsProviderError(upstreamEmptyAudioMessage(), 502);
      }
      const contentType = normalizeContentType(
        responseContentType,
        expectedContentType,
      );

      recordMetric(
        endpoint.url,
        params.text.length,
        Date.now() - startTime,
        true,
      );

      return {
        audioBytes: bytes,
        contentType,
        upstreamRequestId,
        durationSeconds: null,
        endpointUrl: endpoint.url,
      };
    } catch (err) {
      recordMetric(
        endpoint.url,
        params.text.length,
        Date.now() - startTime,
        false,
      );
      lastError = err as Error;
      if (err instanceof TtsProviderError) {
        if (err.status === 400 || err.status === 422) {
          // Payload errors fail identically on every endpoint; do not fail over.
          throw err;
        }
        // 401/403/402/429/5xx are endpoint-specific. The inner block already
        // disabled the endpoint where applicable; continue to the next account.
        if (err.status !== 401 && err.status !== 403) {
          disableEndpoint(
            endpoint.url,
            `Synthesis Error ${err.status}: ${err.message}`,
            err.status === 502 ? 15000 : undefined,
          );
        }
      } else {
        // A timeout/abort is request-specific (slow GPU cold start or long
        // generation), not proof the endpoint is unhealthy. Give it only a brief
        // cooldown so one slow chunk can't disable the whole pool for 5 minutes.
        const isTimeout =
          err instanceof DOMException
            ? err.name === "TimeoutError" || err.name === "AbortError"
            : err instanceof Error &&
              (err.name === "TimeoutError" || err.name === "AbortError");
        if (isTimeout) {
          disableEndpoint(
            endpoint.url,
            `Timeout: ${err instanceof Error ? err.message : String(err)}`,
            15000,
          );
        } else {
          disableEndpoint(
            endpoint.url,
            `Network Error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      console.warn(
        `Attempt ${attempt}/${maxAttempts} failed on ${endpoint.url}. Retrying next available endpoint...`,
      );
    }
  }

  throw (
    lastError ||
    new TtsProviderError("All upstream endpoints in pool failed.", 502)
  );
}

// VoxCPM2 is stochastic and occasionally returns a near-silent chunk; a retry
// usually produces usable audio. Never save a bad silent attempt after retries.
async function synthesizeChunkWithSilenceRetry(
  params: {
    mode: GenerationMode;
    text: string;
    voice: string;
    model?: string;
    cloneSample?: CloneSample;
    denoiseReference?: boolean;
    continuationPrompt?: ChunkContinuationPrompt;
  },
  model: string,
  responseFormat: AudioResponseFormat,
  expectedContentType: string,
): Promise<Awaited<ReturnType<typeof synthesizeSingleChunk>>> {
  // Two retries by default (3 total attempts). Analyzes raw upstream audio for
  // silence AND buzzing/stuck-tonal/noise issues; passing audio is returned
  // unchanged, failing audio is regenerated (with temperature escalation).
  const maxAttempts =
    Math.round(readNumericEnv("TTS_NEAR_SILENCE_RETRIES", 2, 0, 5)) + 1;
  let lastError: Error | null = null;
  let lastSilenceIssue: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await synthesizeSingleChunk(
        params,
        model,
        responseFormat,
        expectedContentType,
        attempt - 1,
      );
      const analysis = await analyzeRawGeneratedAudioSilence(
        result.audioBytes,
        result.contentType,
      );

      if (!analysis.issue) {
        return {
          ...result,
          durationSeconds: result.durationSeconds ?? analysis.durationSeconds,
        };
      }

      lastSilenceIssue = analysis.issue;
      if (attempt < maxAttempts) {
        console.warn(
          `[TTS] Silent upstream chunk (${analysis.issue}); regenerating attempt ${attempt}/${maxAttempts} for ${params.mode} chunk of ${Array.from(params.text).length} chars.`,
        );
      }
    } catch (error) {
      lastError = error as Error;
      if (
        error instanceof TtsProviderError &&
        [400, 401, 403, 422].includes(error.status)
      ) {
        throw error;
      }
      if (attempt < maxAttempts) {
        console.warn(
          `[TTS] Chunk synthesis or silence analysis failed (${error instanceof Error ? error.message : String(error)}); regenerating attempt ${attempt}/${maxAttempts}.`,
        );
      }
    }
  }

  console.warn(
    `[TTS] Chunk rejected after ${maxAttempts} attempts: ${lastSilenceIssue ?? lastError?.message ?? "unknown silent audio failure"}.`,
  );
  throw new TtsProviderError(nearSilentAudioMessage(), 502);
}

type ChunkSynthesisResult = Awaited<ReturnType<typeof synthesizeSingleChunk>>;

async function analyzeDeliveredAudio(
  bytes: Uint8Array,
): Promise<{ issue: string | null; longestTonalSeconds: number }> {
  try {
    const sampleRate = readCanonicalGeneratedSampleRate();
    const pcmBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-codec:a",
        "pcm_s16le",
        "-sample_fmt",
        "s16",
        "-f",
        "s16le",
        "pipe:1",
      ],
      bytes,
    );
    if (pcmBytes.byteLength < 2) return { issue: null, longestTonalSeconds: 0 };
    const wav = createPcm16Wav(
      Buffer.from(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength),
      1,
      sampleRate,
    );
    const stats = getWavPcm16Stats(wav);
    if (!stats) return { issue: null, longestTonalSeconds: 0 };
    return {
      issue: generatedAudioStatsIssue(stats),
      longestTonalSeconds: stats.longestSteadyTonalSeconds,
    };
  } catch {
    // Never fail delivery over the safeguard's own analysis.
    return { issue: null, longestTonalSeconds: 0 };
  }
}

async function synthesizeAllChunks(
  chunks: string[],
  params: {
    mode: GenerationMode;
    voice: string;
    model?: string;
    cloneSample?: CloneSample;
    denoiseReference?: boolean;
  },
  model: string,
  responseFormat: AudioResponseFormat,
  expectedContentType: string,
): Promise<ChunkSynthesisResult[]> {
  const synthesizeOne = (chunkText: string, continuationPrompt?: ChunkContinuationPrompt) =>
    synthesizeChunkWithSilenceRetry(
      { ...params, text: chunkText, continuationPrompt },
      model,
      responseFormat,
      expectedContentType,
    );

  if (!chunkContinuationEnabled() || chunks.length <= 1) {
    return mapWithConcurrency(chunks, resolveChunkConcurrency(), (chunkText) =>
      synthesizeOne(chunkText),
    );
  }

  const results: ChunkSynthesisResult[] = [];
  let continuation: ChunkContinuationPrompt | undefined;

  for (let index = 0; index < chunks.length; index++) {
    const result = await synthesizeOne(chunks[index], continuation);
    results.push(result);

    if (index < chunks.length - 1) {
      const tailSeconds = continuationPromptSeconds();
      try {
        continuation = {
          wavBytes: extractWavTailBytes(result.audioBytes, tailSeconds),
          text: tailTextForContinuation(
            chunks[index],
            tailSeconds,
            estimatedCharsPerSecond(params.mode),
          ),
        };
      } catch {
        continuation = undefined;
      }
    }
  }

  return results;
}

async function synthesizeMergedAudio(params: {
  mode: GenerationMode;
  text: string;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  denoiseReference?: boolean;
}): Promise<TtsSynthesisResult> {
  const model = (
    params.model ??
    process.env.TTS_UPSTREAM_MODEL ??
    "voxcpm2"
  ).trim();
  const responseFormat = readAudioResponseFormat();
  const expectedContentType = contentTypeForResponseFormat(responseFormat);

  // Split long text into roughly one-minute requests. Tiny text chunks made
  // long-form speech sound clipped and inconsistent, so normal generation now
  // keeps VoxCPM2 segments much larger and preserves the upstream audio.
  const chunks = splitTextIntoChunks(
    params.text,
    upstreamChunkChars(params.mode),
  );

  // Long text is split into ~1-minute chunks. When continuation is enabled,
  // each chunk after the first also receives the tail of the previous chunk as
  // prompt audio so VoxCPM2 keeps the same speaking style (not just timbre).
  const chunkResults: ChunkSynthesisResult[] = await synthesizeAllChunks(
    chunks,
    params,
    model,
    responseFormat,
    expectedContentType,
  );

  // Independently generated chunks drift in volume, which makes long audio get
  // louder/quieter over time. Align WAV chunks to one common loudness with a
  // capped linear gain (volume only, no EQ/tone change) before encoding.
  const leveledChunks = levelWavChunksToCommonLoudness(
    chunkResults.map((result) => result.audioBytes),
  );

  const publicSegments: Uint8Array[] = [];
  let summedSeconds = 0;
  let hasSummedSeconds = false;

  for (let index = 0; index < chunkResults.length; index++) {
    const result = chunkResults[index];
    let chunkBytes = leveledChunks[index] ?? result.audioBytes;
    if (index > 0 && chunkContinuationEnabled()) {
      chunkBytes = applyWavHeadFadeIn(
        chunkBytes,
        readNumericEnv("TTS_CONTINUATION_HEAD_FADE_MS", 30, 0, 120),
      );
    }
    const resultSeconds =
      result.durationSeconds ??
      inferAudioDurationSeconds(chunkBytes, result.contentType);
    const publicAudio = await normalizeToPublicFormat(
      chunkBytes,
      result.contentType,
      resultSeconds,
    );
    publicSegments.push(publicAudio.bytes);
    if (
      typeof publicAudio.outputSeconds === "number" &&
      Number.isFinite(publicAudio.outputSeconds) &&
      publicAudio.outputSeconds > 0
    ) {
      summedSeconds += publicAudio.outputSeconds;
      hasSummedSeconds = true;
    }
  }

  // Smart concat: crossfade audible mid-phrase seams, pause-pad quiet sentence
  // boundaries. Plain data-segment splicing produces audible clicks at chunk
  // joins, which the MP3 path used to mask via concatMp3Buffers' own join logic.
  const mergedBytes = concatPcm16WavBuffers(publicSegments);
  const depausedBytes = await capLongPauses(mergedBytes);
  const denoisedBytes = await reduceOutputNoise(depausedBytes);
  const normalizedBytes = await normalizeOutputLoudness(denoisedBytes);
  const pacedBytes = await applyOutputTempo(normalizedBytes, params.mode);
  const deliverableBytes = finalizeDeliveredWav(pacedBytes);
  const deliveredSeconds = await measureDeliveredAudioDurationSeconds(
    deliverableBytes,
    PUBLIC_AUDIO_CONTENT_TYPE,
  );

  const upstreamRequestId = chunkResults
    .map((r) => r.upstreamRequestId)
    .filter(Boolean)
    .join(",");

  return {
    audioBytes: deliverableBytes,
    contentType: PUBLIC_AUDIO_CONTENT_TYPE,
    model,
    upstreamRequestId,
    outputSeconds:
      deliveredSeconds ?? (hasSummedSeconds ? summedSeconds : null),
  };
}

export async function synthesizeWithUpstream(params: {
  mode: GenerationMode;
  text: string;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  denoiseReference?: boolean;
}): Promise<TtsSynthesisResult> {
  // Bounded final-quality retry. The per-chunk gate analyzes raw (quiet)
  // upstream audio, so a buzz that only becomes audible after the delivery-
  // loudness boost can slip through. Re-check the delivered audio and, if it
  // buzzes, regenerate the whole synthesis a small number of times. On
  // exhaustion we deliver the least-buzzy attempt rather than failing a
  // request that is otherwise fine. Disabled with TTS_FINAL_QUALITY_RETRIES=0.
  const maxAttempts =
    Math.round(readNumericEnv("TTS_FINAL_QUALITY_RETRIES", 2, 0, 3)) + 1;
  let best: { result: TtsSynthesisResult; tonalSeconds: number } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await synthesizeMergedAudio(params);
    if (attempt >= maxAttempts && best === null) {
      // Last attempt and nothing kept yet: skip the extra analysis pass.
      return result;
    }
    const analysis = await analyzeDeliveredAudio(result.audioBytes);
    if (!analysis.issue) {
      return result;
    }
    if (best === null || analysis.longestTonalSeconds < best.tonalSeconds) {
      best = { result, tonalSeconds: analysis.longestTonalSeconds };
    }
    if (attempt < maxAttempts) {
      console.warn(
        `[TTS] Delivered audio quality issue (${analysis.issue}); regenerating whole synthesis attempt ${attempt}/${maxAttempts} for ${params.mode} of ${Array.from(params.text).length} chars.`,
      );
    }
  }

  return best?.result ?? (await synthesizeMergedAudio(params));
}
