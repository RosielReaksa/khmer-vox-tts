import "server-only";

import { spawn } from "child_process";

import { PUBLIC_AUDIO_CONTENT_TYPE, PUBLIC_AUDIO_OUTPUT_FORMAT } from "@/lib/audio-api";
import type { GenerationMode } from "@/lib/types";
import { DEFAULT_CLONE_VOICE_INSTRUCTION } from "@/lib/voice-defaults";
import { concatMp3Buffers } from "./audio-merge";
import { disableEndpoint, getUpstreamEndpoints, selectUpstreamEndpoint, type UpstreamEndpoint } from "./tts-endpoints";

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

function recordMetric(url: string, characterCount: number, latencyMs: number, success: boolean): void {
  import("./modal-analytics")
    .then((module) => module.recordSynthesisMetric(url, characterCount, latencyMs, success))
    .catch(console.error);
}

export function selectEndpoint(): UpstreamEndpoint {
  const endpoint = selectUpstreamEndpoint();
  if (!endpoint) {
    throw new TtsProviderError(
      "TTS upstream is not configured. Set TTS_UPSTREAM_POOL or TTS_UPSTREAM_URL in environment.",
      503
    );
  }
  return endpoint;
}

function readRequiredUpstreamUrl(): string {
  const pool = getUpstreamEndpoints();
  if (pool.length === 0) {
    throw new TtsProviderError(
      "TTS upstream is not configured. Set TTS_UPSTREAM_URL or TTS_UPSTREAM_POOL in your environment.",
      503,
    );
  }
  return pool[0].url;
}

type AudioResponseFormat = typeof PUBLIC_AUDIO_OUTPUT_FORMAT | "wav" | "ogg" | "webm";

function readAudioResponseFormat(): AudioResponseFormat {
  const value = (
    process.env.TTS_UPSTREAM_RESPONSE_FORMAT ??
    ""
  ).trim().toLowerCase();
  if (value === PUBLIC_AUDIO_OUTPUT_FORMAT || value === "wav" || value === "ogg" || value === "webm") return value;
  return "wav";
}

function contentTypeForResponseFormat(format: AudioResponseFormat): string {
  if (format === "mp3") return PUBLIC_AUDIO_CONTENT_TYPE;
  if (format === "ogg") return "audio/ogg";
  if (format === "webm") return "audio/webm";
  return "audio/wav";
}

function normalizeContentType(value: string | null, fallback = "audio/wav"): string {
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
    const parts = value.map(errorTextFromValue).filter((part): part is string => Boolean(part));
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

async function normalizeCloneSampleForUpstream(sample: CloneSample): Promise<CloneSample> {
  try {
    const wavBytes = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
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
      throw new TtsProviderError("Reference audio conversion produced empty audio.", 400);
    }
    const durationSeconds = inferWavDurationSeconds(wavBytes);
    if (durationSeconds !== null && durationSeconds < 0.5) {
      throw new TtsProviderError("Reference voice sample is too short. Upload a clear 5-30 second voice sample.", 400);
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
    return DEFAULT_CLONE_VOICE_INSTRUCTION;
  }

  return trimmed;
}

function readNumericEnv(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function estimateMaxGenerateLength(text: string, mode: GenerationMode): number {
  const charCount = Array.from(text).length;
  const charsPerSecond = mode === "clone" ? 13 : 20;
  const paddingSeconds = mode === "clone" ? 4 : 2;
  const targetSeconds = Math.max(5, Math.ceil(charCount / charsPerSecond) + paddingSeconds);
  const tokensPerSecond = readNumericEnv("TTS_MAX_GENERATE_TOKENS_PER_SECOND", 9, 4, 20);
  const hardMax = mode === "clone"
    ? readNumericEnv("TTS_CLONE_MAX_GENERATE_LENGTH", 1600, 100, 8192)
    : readNumericEnv("TTS_MAX_GENERATE_LENGTH", 2400, 100, 8192);

  return Math.min(hardMax, Math.max(100, Math.ceil(targetSeconds * tokensPerSecond)));
}

function inferWavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
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
  return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}

function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.toString("ascii", 0, 3) === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

type Pcm16WavInfo = {
  channels: 1 | 2;
  sampleRate: number;
  durationSeconds: number | null;
  dataOffset: number;
  dataSize: number;
};

function readPcm16Wav(bytes: Uint8Array): Pcm16WavInfo {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!looksLikeWav(bytes)) {
    throw new TtsProviderError("Upstream returned non-WAV audio that cannot be converted to MP3.", 502);
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkSize > buffer.length) break;

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = buffer.readUInt16LE(chunkDataOffset);
      channels = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || (channels !== 1 && channels !== 2) || sampleRate <= 0 || dataSize <= 0) {
    throw new TtsProviderError("Upstream WAV format is not supported for MP3 conversion.", 502);
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

async function runFfmpeg(args: string[], input?: Uint8Array): Promise<Uint8Array> {
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
      reject(new TtsProviderError(`FFmpeg MP3 conversion could not start: ${error.message}`, 502));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(new Uint8Array(Buffer.concat(stdout)));
        return;
      }
      const message = Buffer.concat(stderr).toString("utf8").trim().slice(0, 260);
      reject(new TtsProviderError(message || `FFmpeg MP3 conversion failed with exit code ${code}.`, 502));
    });
    if (input) {
      child.stdin.end(Buffer.from(input));
    } else {
      child.stdin.end();
    }
  });
}

async function encodeWavToMp3(bytes: Uint8Array): Promise<{ bytes: Uint8Array; durationSeconds: number | null }> {
  const wav = readPcm16Wav(bytes);
  const output = await runFfmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "64k",
      "-f",
      "mp3",
      "pipe:1",
    ],
    bytes,
  );
  if (output.byteLength <= 0) {
    throw new TtsProviderError("MP3 conversion produced empty audio.", 502);
  }
  return { bytes: output, durationSeconds: wav.durationSeconds };
}

function getWavPcm16Stats(bytes: Uint8Array): { rms: number; peak: number } | null {
  if (bytes.byteLength < 44) return null;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkSize > buffer.length) break;

    if (chunkId === "fmt " && chunkSize >= 16) {
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (bitsPerSample !== 16 || dataSize < 2) return null;

  let sumSquares = 0;
  let peak = 0;
  let samples = 0;
  const end = Math.min(buffer.length, dataOffset + dataSize);
  for (let index = dataOffset; index + 1 < end; index += 2) {
    const value = buffer.readInt16LE(index);
    const abs = Math.abs(value);
    peak = Math.max(peak, abs);
    sumSquares += value * value;
    samples += 1;
  }

  if (samples === 0) return null;
  return {
    rms: Math.sqrt(sumSquares / samples),
    peak,
  };
}

function assertUsableGeneratedAudio(bytes: Uint8Array, contentType: string): void {
  const lower = contentType.toLowerCase();
  if (!lower.includes("wav") && !looksLikeWav(bytes)) {
    return;
  }

  const stats = getWavPcm16Stats(bytes);
  if (!stats) return;

  if (stats.rms < 80 && stats.peak < 1200) {
    throw new TtsProviderError(
      "Upstream generated near-silent audio. Try a clearer reference voice sample.",
      502,
    );
  }
}

function inferAudioDurationSeconds(bytes: Uint8Array, contentType: string): number | null {
  if (contentType.toLowerCase().includes("wav") || looksLikeWav(bytes)) {
    return inferWavDurationSeconds(bytes);
  }
  return null;
}

async function normalizeToPublicMp3(
  bytes: Uint8Array,
  contentType: string,
  outputSeconds: number | null,
): Promise<{ bytes: Uint8Array; contentType: string; outputSeconds: number | null }> {
  const lower = contentType.toLowerCase();
  if (lower.includes("mpeg") || lower.includes("mp3") || looksLikeMp3(bytes)) {
    return { bytes, contentType: PUBLIC_AUDIO_CONTENT_TYPE, outputSeconds };
  }
  if (lower.includes("wav") || looksLikeWav(bytes)) {
    const converted = await encodeWavToMp3(bytes);
    return {
      bytes: converted.bytes,
      contentType: PUBLIC_AUDIO_CONTENT_TYPE,
      outputSeconds: outputSeconds ?? converted.durationSeconds,
    };
  }
  throw new TtsProviderError("Upstream returned an audio format that cannot be converted to MP3.", 502);
}

export function splitTextIntoChunks(text: string, maxChunkChars = 400): string[] {
  const charCount = Array.from(text).length;
  if (charCount <= maxChunkChars) {
    return [text];
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
        // Punctuation characters to split on: Khmer '។', English '.', '!', '?', etc.
        const sentences = paraClean.split(/(?<=[។\.\!\?])\s*/);
        for (const sentence of sentences) {
          const sentenceClean = sentence.trim();
          if (!sentenceClean) continue;

          const sentenceChars = Array.from(sentenceClean);
          if (sentenceChars.length + currentLen <= maxChunkChars) {
            if (currentChunk.length > 0) {
              currentChunk.push(" ");
            }
            currentChunk.push(sentenceClean);
            currentLen += sentenceChars.length + (currentChunk.length > 1 ? 1 : 0);
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
                  currentLen += wordChars.length + (currentChunk.length > 1 ? 1 : 0);
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
                      const sliceChars = wordChars.slice(wordIndex, wordIndex + maxChunkChars);
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

  return chunks.filter(Boolean);
}

function createPcm16Wav(data: Buffer, channels: 1 | 2, sampleRate: number): Uint8Array {
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

function concatPcm16WavBuffers(buffers: Uint8Array[]): Uint8Array {
  if (buffers.length === 0) return new Uint8Array();
  if (buffers.length === 1) return buffers[0];

  const infos = buffers.map((buffer) => readPcm16Wav(buffer));
  const first = infos[0];
  for (const info of infos.slice(1)) {
    if (info.channels !== first.channels || info.sampleRate !== first.sampleRate) {
      throw new TtsProviderError("Upstream WAV chunks use different formats and cannot be merged.", 502);
    }
  }

  const data = Buffer.concat(
    buffers.map((buffer, index) => {
      const info = infos[index];
      const source = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      return source.subarray(info.dataOffset, info.dataOffset + info.dataSize);
    }),
  );

  return createPcm16Wav(data, first.channels, first.sampleRate);
}

async function synthesizeSingleChunk(
  params: {
    mode: GenerationMode;
    text: string;
    voice: string;
    model?: string;
    cloneSample?: CloneSample;
  },
  model: string,
  responseFormat: AudioResponseFormat,
  expectedContentType: string
): Promise<{ audioBytes: Uint8Array; contentType: string; upstreamRequestId: string | null; durationSeconds: number | null }> {
  const payload: Record<string, unknown> = {
    model,
    input: params.text,
    voice: params.voice,
    response_format: responseFormat,
    max_generate_length: estimateMaxGenerateLength(params.text, params.mode),
  };

  if (params.mode === "clone") {
    if (!params.cloneSample) {
      throw new TtsProviderError("Clone mode requires an uploaded sample.", 400);
    }
    const normalizedSample = await normalizeCloneSampleForUpstream(params.cloneSample);
    const base64 = Buffer.from(normalizedSample.bytes).toString("base64");
    if (process.env.TTS_CLONE_USE_VOICE_DESCRIPTION?.trim().toLowerCase() === "true") {
      payload.voice = normalizeCloneVoiceDescription(params.voice);
    } else {
      delete payload.voice;
    }
    payload.temperature = readNumericEnv("TTS_CLONE_TEMPERATURE", 1.0, 0.1, 2.0);
    payload.cfg_value = readNumericEnv("TTS_CLONE_CFG_VALUE", 2.0, 0.1, 5.0);
    payload.ref_audio_wav_base64 = base64;
    payload.ref_audio_wav_format = "wav";
  }

  const pool = getUpstreamEndpoints();
  if (pool.length === 0) {
    throw new TtsProviderError("TTS upstream is not configured. Set TTS_UPSTREAM_POOL or TTS_UPSTREAM_URL in environment.", 503);
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
      const untried = pool.find(ep => !attemptedUrls.has(ep.url));
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

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000), // 90 seconds timeout to accommodate slow GPU cold starts
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

        recordMetric(endpoint.url, params.text.length, Date.now() - startTime, false);

        // If it's a client parameter error, throw immediately
        if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) {
          throw new TtsProviderError(message, response.status);
        }

        // Otherwise (402, 429, 5xx), disable endpoint and retry
        disableEndpoint(endpoint.url, `HTTP ${response.status}: ${message}`);
        throw new TtsProviderError(message, response.status);
      }

      const responseContentType = response.headers.get("content-type");
      const isJson = responseContentType?.toLowerCase().includes("application/json");

      if (isJson) {
        const data = (await response.json()) as Record<string, unknown>;
        const base64 =
          (typeof data.audio_base64 === "string" && data.audio_base64) ||
          (typeof data.audioBase64 === "string" && data.audioBase64) ||
          (typeof data.audio === "string" && data.audio) ||
          (typeof data.data === "string" && data.data);

        if (!base64) {
          throw new TtsProviderError("Upstream returned JSON but no audio payload.", 502);
        }

        const contentType =
          (typeof data.content_type === "string" && data.content_type) ||
          (typeof data.mime_type === "string" && data.mime_type) ||
          expectedContentType;

        const audioBytes = Buffer.from(base64, "base64");
        const normalizedContentType = normalizeContentType(contentType, expectedContentType);

        const durationSeconds =
          asNumberOrNull(data.duration_seconds) ??
          asNumberOrNull(data.audio_duration_seconds) ??
          asNumberOrNull(data.duration) ??
          asNumberOrNull(data.durationSeconds);

        recordMetric(endpoint.url, params.text.length, Date.now() - startTime, true);

        return {
          audioBytes,
          contentType: normalizedContentType,
          upstreamRequestId,
          durationSeconds,
        };
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new TtsProviderError("Upstream returned empty audio data.", 502);
      }
      const contentType = normalizeContentType(responseContentType, expectedContentType);

      recordMetric(endpoint.url, params.text.length, Date.now() - startTime, true);

      return {
        audioBytes: bytes,
        contentType,
        upstreamRequestId,
        durationSeconds: null,
      };

    } catch (err) {
      recordMetric(endpoint.url, params.text.length, Date.now() - startTime, false);
      lastError = err as Error;
      if (err instanceof TtsProviderError && (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 422)) {
        throw err;
      }
      if (!(err instanceof TtsProviderError)) {
        disableEndpoint(endpoint.url, `Network Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      console.warn(`Attempt ${attempt}/${maxAttempts} failed on ${endpoint.url}. Retrying next available endpoint...`);
    }
  }

  throw lastError || new TtsProviderError("All upstream endpoints in pool failed.", 502);
}

export async function synthesizeWithUpstream(params: {
  mode: GenerationMode;
  text: string;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
}): Promise<TtsSynthesisResult> {
  const model = (params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2").trim();
  const responseFormat = readAudioResponseFormat();
  const expectedContentType = contentTypeForResponseFormat(responseFormat);

  // Split text into chunks to prevent upstream timeout on long text
  const chunks = splitTextIntoChunks(params.text, 400);

  if (chunks.length <= 1) {
    // Single chunk logic
    const single = await synthesizeSingleChunk(
      params,
      model,
      responseFormat,
      expectedContentType
    );
    assertUsableGeneratedAudio(single.audioBytes, single.contentType);
    const publicAudio = await normalizeToPublicMp3(
      single.audioBytes,
      single.contentType,
      single.durationSeconds ?? inferAudioDurationSeconds(single.audioBytes, single.contentType)
    );

    return {
      audioBytes: publicAudio.bytes,
      contentType: publicAudio.contentType,
      model,
      upstreamRequestId: single.upstreamRequestId,
      outputSeconds: publicAudio.outputSeconds,
    };
  }

  // Multi-chunk parallel execution
  const promises = chunks.map((chunkText) =>
    synthesizeSingleChunk(
      { ...params, text: chunkText },
      model,
      responseFormat,
      expectedContentType
    )
  );

  const chunkResults = await Promise.all(promises);

  const normalizedContentType = normalizeContentType(chunkResults[0].contentType, expectedContentType);
  const mergedBytes =
    normalizedContentType.includes("mpeg") || chunkResults.every((result) => looksLikeMp3(result.audioBytes))
      ? await concatMp3Buffers(chunkResults.map((result) => result.audioBytes))
      : concatPcm16WavBuffers(chunkResults.map((result) => result.audioBytes));

  assertUsableGeneratedAudio(mergedBytes, normalizedContentType);

  const publicAudio = await normalizeToPublicMp3(
    mergedBytes,
    normalizedContentType,
    inferAudioDurationSeconds(mergedBytes, normalizedContentType)
  );

  const upstreamRequestId = chunkResults
    .map((r) => r.upstreamRequestId)
    .filter(Boolean)
    .join(",");

  return {
    audioBytes: publicAudio.bytes,
    contentType: publicAudio.contentType,
    model,
    upstreamRequestId,
    outputSeconds: publicAudio.outputSeconds,
  };
}
