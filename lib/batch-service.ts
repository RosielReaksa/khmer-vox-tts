import { createHmac } from "node:crypto";
import "server-only";

import {
  calculateGenerationUsage,
  buildInputPreview,
  GenerationServiceError,
  resolveGenerationCloneCreditRate,
  runGenerationForUser,
} from "@/lib/generation-service";
import { PUBLIC_AUDIO_OUTPUT_FORMAT, publicBatchJobUrls } from "@/lib/audio-api";
import {
  buildAudioObjectKey,
  putAudioObject,
  resolveAudioBytes,
} from "@/lib/audio-storage";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { prepareTextForSpeech } from "@/lib/speech-text-sanitizer";
import {
  claimNextQueuedBatchJob,
  claimQueuedBatchJob,
  claimQueuedBatchJobItem,
  clearBatchJobCloneSample,
  createBatchJob,
  createDashboardBatchJobWithCapacity,
  createBatchJobWebhookAttempt,
  createGenerationRecord,
  findUserById,
  getBatchJobWithItems,
  getStoreMode,
  getUserGenerationRecord,
  recordWorkerHeartbeat,
  recoverStuckBatchJobs,
  getUserTokenBalance,
  refreshBatchJobRollup,
  resetRetryableBatchJobItems,
  updateBatchJobWebhookStatus,
  updateBatchJobItem,
  updateBatchJobStatus,
} from "@/lib/store";
import { mergePublicMp3SegmentsForDelivery } from "@/lib/tts-provider";
import type { CloneSample } from "@/lib/tts-provider";
import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { isDashboardMergeJob, readDashboardMergeOptions } from "@/lib/batch-merge-marker";
import type {
  BatchJobItemRecord,
  BatchJobRecord,
  BatchJobWebhookDeliveryStatus,
  GenerationMode,
  GenerationSource,
  WorkerHeartbeatStatus,
} from "@/lib/types";
import { MAX_TEXT_CHARS, type UsagePolicyName } from "@/lib/usage-policy";
import { VOICE_CLONE_CONSENT_TEXT } from "@/lib/voice-consent";
import { safeFetch } from "@/lib/ssrf-guard";

const BATCH_RATE_LIMIT_WAIT_MS = 3_000;
const BATCH_RATE_LIMIT_MAX_RETRIES = 10;
const BATCH_WEBHOOK_TIMEOUT_MS = 8_000;

type BatchRateLimitAcquireResult =
  | Extract<UsageLimitResult, { ok: true }>
  | {
      ok: false;
      retryAt: string;
      message: string;
    };

export const MAX_BATCH_ITEMS = 100;
export const MAX_DASHBOARD_BATCH_ITEMS = 160;
export const MAX_BATCH_TOTAL_CHARS = 50_000;
export const MAX_WEBHOOK_URL_CHARS = 2_048;
export const MAX_EXTERNAL_ID_CHARS = 160;
export const MAX_BATCH_SPEAKER_CHARS = 120;
export const MAX_BATCH_METADATA_JSON_CHARS = 4_096;

// Re-exported from a dependency-free module so the marker logic is unit-testable
// without the server-only import chain. See lib/batch-merge-marker.ts.
export {
  DASHBOARD_MERGE_JOB_KIND,
  dashboardMergeMetadataJson,
  isDashboardMergeJob,
} from "@/lib/batch-merge-marker";

export type BatchLineInput = {
  text: string;
  externalId?: string | null;
  speaker?: string | null;
  startMs?: number | null;
  endMs?: number | null;
  metadataJson?: string | null;
};

export class BatchJobServiceError extends Error {
  status: number;
  code: string;
  remainingTokens?: number;

  constructor(message: string, status: number, code: string, remainingTokens?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.remainingTokens = remainingTokens;
  }
}

export function normalizeWebhookCallbackUrl(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_WEBHOOK_URL_CHARS) {
    throw new BatchJobServiceError("Webhook URL is too long.", 400, "WEBHOOK_URL_TOO_LONG");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BatchJobServiceError("Webhook URL must be a valid URL.", 400, "WEBHOOK_URL_INVALID");
  }

  const isAllowedProtocol =
    url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  if (!isAllowedProtocol) {
    throw new BatchJobServiceError("Webhook URL must use HTTPS.", 400, "WEBHOOK_URL_HTTPS_REQUIRED");
  }
  if (url.username || url.password) {
    throw new BatchJobServiceError("Webhook URL cannot include credentials.", 400, "WEBHOOK_URL_INVALID");
  }

  return url.toString();
}

export function parseBatchLines(input: string | string[]): string[] {
  const rawLines = Array.isArray(input) ? input : input.split(/\r?\n/);
  return rawLines.map((line) => line.trim()).filter(Boolean);
}

function normalizeOptionalText(
  input: string | null | undefined,
  maxChars: number,
  fieldName: string,
  code: string,
): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxChars) {
    throw new BatchJobServiceError(`${fieldName} is too long.`, 400, code);
  }
  return trimmed;
}

export function serializeBatchMetadata(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  let serialized: string;
  if (typeof input === "string") {
    serialized = input.trim();
    if (!serialized) return null;
    try {
      JSON.parse(serialized);
    } catch {
      throw new BatchJobServiceError("Metadata must be valid JSON.", 400, "BATCH_METADATA_INVALID");
    }
  } else {
    try {
      serialized = JSON.stringify(input);
    } catch {
      throw new BatchJobServiceError("Metadata must be JSON serializable.", 400, "BATCH_METADATA_INVALID");
    }
  }
  if (serialized.length > MAX_BATCH_METADATA_JSON_CHARS) {
    throw new BatchJobServiceError("Metadata JSON is too large.", 400, "BATCH_METADATA_TOO_LARGE");
  }
  return serialized;
}

export function parseBatchMetadataJson(input: string | null): unknown | null {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeOptionalMs(input: number | null | undefined, fieldName: string): number | null {
  if (input === null || input === undefined) return null;
  if (!Number.isFinite(input) || input < 0) {
    throw new BatchJobServiceError(`${fieldName} must be a non-negative number.`, 400, "BATCH_TIMING_INVALID");
  }
  return Math.round(input);
}

function normalizeBatchLine(input: string | BatchLineInput): BatchLineInput | null {
  if (typeof input === "string") {
    const text = prepareTextForSpeech(input);
    return text ? { text } : null;
  }
  const text = prepareTextForSpeech(input.text);
  if (!text) return null;
  const startMs = normalizeOptionalMs(input.startMs, "start_ms");
  const endMs = normalizeOptionalMs(input.endMs, "end_ms");
  if (startMs !== null && endMs !== null && endMs < startMs) {
    throw new BatchJobServiceError("end_ms must be greater than or equal to start_ms.", 400, "BATCH_TIMING_INVALID");
  }
  return {
    text,
    externalId: normalizeOptionalText(input.externalId, MAX_EXTERNAL_ID_CHARS, "Line external_id", "BATCH_EXTERNAL_ID_TOO_LONG"),
    speaker: normalizeOptionalText(input.speaker, MAX_BATCH_SPEAKER_CHARS, "Line speaker", "BATCH_SPEAKER_TOO_LONG"),
    startMs,
    endMs,
    metadataJson: input.metadataJson ?? null,
  };
}

export function normalizeBatchLines(input: Array<string | BatchLineInput>): BatchLineInput[] {
  return input.map(normalizeBatchLine).filter((line): line is BatchLineInput => Boolean(line));
}

export function estimateBatchUsage(
  lines: string[],
  mode: GenerationMode,
  options?: { cloneCreditsPerSecond?: number },
): {
  totalInputChars: number;
  creditsEstimated: number;
} {
  return lines.reduce(
    (acc, line) => {
      const usage = calculateGenerationUsage(line, mode, options);
      return {
        totalInputChars: acc.totalInputChars + usage.charCount,
        creditsEstimated: acc.creditsEstimated + usage.creditsRequested,
      };
    },
    { totalInputChars: 0, creditsEstimated: 0 },
  );
}

export function estimateBatchLineUsage(
  lines: BatchLineInput[],
  mode: GenerationMode,
  options?: { cloneCreditsPerSecond?: number },
): {
  totalInputChars: number;
  creditsEstimated: number;
} {
  return estimateBatchUsage(lines.map((line) => line.text), mode, options);
}

function cloneSampleToStored(sample: CloneSample): {
  cloneSampleBase64: string;
  cloneSampleMimeType: string;
  cloneSampleFileName: string;
} {
  return {
    cloneSampleBase64: Buffer.from(sample.bytes).toString("base64"),
    cloneSampleMimeType: sample.mimeType || "audio/wav",
    cloneSampleFileName: sample.fileName || "sample.wav",
  };
}

function storedCloneSample(job: BatchJobRecord): CloneSample | null {
  if (!job.cloneSampleBase64) return null;
  return {
    bytes: Buffer.from(job.cloneSampleBase64, "base64"),
    mimeType: job.cloneSampleMimeType ?? "audio/wav",
    fileName: job.cloneSampleFileName ?? "sample.wav",
  };
}

async function validateBatchRequest(params: {
  userId: string;
  mode: GenerationMode;
  source: GenerationSource;
  lines: Array<string | BatchLineInput>;
  cloneSample?: CloneSample;
  cloneConsentAccepted?: boolean;
}): Promise<{
  lines: BatchLineInput[];
  lineUsages: Array<ReturnType<typeof calculateGenerationUsage>>;
  totalInputChars: number;
  creditsEstimated: number;
}> {
  const lines = normalizeBatchLines(params.lines);
  if (lines.length === 0) {
    throw new BatchJobServiceError("At least one text line is required.", 400, "BATCH_EMPTY");
  }
  const maxItems = params.source === "dashboard" ? MAX_DASHBOARD_BATCH_ITEMS : MAX_BATCH_ITEMS;
  if (lines.length > maxItems) {
    throw new BatchJobServiceError(
      `Batch max is ${maxItems.toLocaleString()} text lines.`,
      400,
      "BATCH_TOO_MANY_ITEMS",
    );
  }

  const cloneCreditsPerSecond = await resolveGenerationCloneCreditRate(params.userId, params.mode, params.source);
  const usageOptions = { cloneCreditsPerSecond };
  const lineUsages = lines.map((line) => calculateGenerationUsage(line.text, params.mode, usageOptions));
  const tooLongIndex = lineUsages.findIndex((usage) => usage.charCount > MAX_TEXT_CHARS);
  if (tooLongIndex >= 0) {
    throw new BatchJobServiceError(
      `Line ${tooLongIndex + 1} is too long. Max ${MAX_TEXT_CHARS.toLocaleString()} characters per line.`,
      400,
      "BATCH_LINE_TOO_LONG",
    );
  }

  const estimate = estimateBatchLineUsage(lines, params.mode, usageOptions);
  if (estimate.totalInputChars > MAX_BATCH_TOTAL_CHARS) {
    throw new BatchJobServiceError(
      `Batch max is ${MAX_BATCH_TOTAL_CHARS.toLocaleString()} total characters.`,
      400,
      "BATCH_TOO_LARGE",
    );
  }
  if (params.mode === "clone") {
    if (!params.cloneSample) {
      throw new BatchJobServiceError(
        "Clone batch requires one reference voice sample.",
        400,
        "CLONE_SAMPLE_REQUIRED",
      );
    }
    if (!params.cloneConsentAccepted) {
      throw new BatchJobServiceError(
        "Voice clone consent is required before uploading a reference voice.",
        400,
        "VOICE_CLONE_CONSENT_REQUIRED",
      );
    }
  }

  const user = await findUserById(params.userId);
  if (!user) {
    throw new BatchJobServiceError("Account not found.", 403, "ACCOUNT_NOT_FOUND");
  }
  const balance = await getUserTokenBalance(params.userId);
  if (user.suspendedAt) {
    throw new BatchJobServiceError("Account is suspended.", 403, "ACCOUNT_SUSPENDED", balance);
  }
  if (balance < estimate.creditsEstimated) {
    throw new BatchJobServiceError(
      "Insufficient tokens for this batch.",
      402,
      "INSUFFICIENT_TOKENS",
      balance,
    );
  }

  return {
    lines,
    lineUsages,
    ...estimate,
  };
}

export async function createQueuedBatchJob(params: {
  userId: string;
  apiKeyId?: string | null;
  source: GenerationSource;
  mode: GenerationMode;
  title?: string;
  lines: Array<string | BatchLineInput>;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  cloneConsentAccepted?: boolean;
  webhookCallbackUrl?: string | null;
  externalId?: string | null;
  metadataJson?: string | null;
}): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] }> {
  const validated = await validateBatchRequest({
    userId: params.userId,
    mode: params.mode,
    source: params.source,
    lines: params.lines,
    cloneSample: params.cloneSample,
    cloneConsentAccepted: params.cloneConsentAccepted,
  });

  const storedSample = params.mode === "clone" && params.cloneSample
    ? cloneSampleToStored(params.cloneSample)
    : {
        cloneSampleBase64: null,
        cloneSampleMimeType: null,
        cloneSampleFileName: null,
      };

  return createBatchJob({
    userId: params.userId,
    apiKeyId: params.apiKeyId ?? null,
    mode: params.mode,
    source: params.source,
    title: params.title ?? `${params.mode === "clone" ? "Clone" : "Speech"} batch`,
    voice: params.voice,
    model: params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2",
    externalId: normalizeOptionalText(params.externalId, MAX_EXTERNAL_ID_CHARS, "Job external_id", "BATCH_EXTERNAL_ID_TOO_LONG"),
    metadataJson: params.metadataJson ?? null,
    lines: validated.lines.map((line, index) => ({
      text: line.text,
      creditsEstimated: validated.lineUsages[index].creditsRequested,
      externalId: line.externalId ?? null,
      speaker: line.speaker ?? null,
      startMs: line.startMs ?? null,
      endMs: line.endMs ?? null,
      metadataJson: line.metadataJson ?? null,
    })),
    ...storedSample,
    cloneConsentAt: params.mode === "clone" ? new Date().toISOString() : null,
    cloneConsentText: params.mode === "clone" ? VOICE_CLONE_CONSENT_TEXT : null,
    webhookCallbackUrl: normalizeWebhookCallbackUrl(params.webhookCallbackUrl),
  });
}

export async function createQueuedDashboardBatchJob(
  params: Parameters<typeof createQueuedBatchJob>[0],
  limits: { maxRunning: number; maxQueued: number },
): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] }> {
  const source = params.source ?? "dashboard";
  if (source !== "dashboard" || params.apiKeyId) {
    throw new BatchJobServiceError("Dashboard queue limits only apply to dashboard jobs.", 400, "DASHBOARD_JOB_INVALID");
  }

  const validated = await validateBatchRequest({
    userId: params.userId,
    mode: params.mode,
    source,
    lines: params.lines,
    cloneSample: params.cloneSample,
    cloneConsentAccepted: params.cloneConsentAccepted,
  });

  const storedSample = params.mode === "clone" && params.cloneSample
    ? cloneSampleToStored(params.cloneSample)
    : {
        cloneSampleBase64: null,
        cloneSampleMimeType: null,
        cloneSampleFileName: null,
      };

  return createDashboardBatchJobWithCapacity({
    userId: params.userId,
    apiKeyId: null,
    mode: params.mode,
    source,
    title: params.title ?? `${params.mode === "clone" ? "Clone" : "Speech"} batch`,
    voice: params.voice,
    model: params.model ?? process.env.TTS_UPSTREAM_MODEL ?? "voxcpm2",
    externalId: normalizeOptionalText(params.externalId, MAX_EXTERNAL_ID_CHARS, "Job external_id", "BATCH_EXTERNAL_ID_TOO_LONG"),
    metadataJson: params.metadataJson ?? null,
    lines: validated.lines.map((line, index) => ({
      text: line.text,
      creditsEstimated: validated.lineUsages[index].creditsRequested,
      externalId: line.externalId ?? null,
      speaker: line.speaker ?? null,
      startMs: line.startMs ?? null,
      endMs: line.endMs ?? null,
      metadataJson: line.metadataJson ?? null,
    })),
    ...storedSample,
    cloneConsentAt: params.mode === "clone" ? new Date().toISOString() : null,
    cloneConsentText: params.mode === "clone" ? VOICE_CLONE_CONSENT_TEXT : null,
    webhookCallbackUrl: normalizeWebhookCallbackUrl(params.webhookCallbackUrl),
  }, limits);
}

async function failRemainingItems(
  jobId: string,
  message: string,
  finalStatus: "failed" | "needs_review" = "failed",
): Promise<void> {
  const fresh = await getBatchJobWithItems(jobId);
  if (!fresh) return;
  for (const item of fresh.items) {
    if (item.status !== "queued" && item.status !== "running") continue;
    await updateBatchJobItem({
      itemId: item.id,
      status: "failed",
      attemptCount: maxBatchItemAttempts(),
      nextRetryAt: null,
      errorMessage: message,
    });
  }
  await updateBatchJobStatus({
    jobId,
    status: finalStatus,
    errorMessage: message,
    deadLetterReason: finalStatus === "needs_review" ? message : undefined,
    lastWorkerError: message,
    nextRetryAt: null,
    completedAt: new Date().toISOString(),
  });
  await refreshBatchJobRollup(jobId);
  await deliverBatchJobWebhookIfNeeded(jobId);
}

function batchRateLimitPolicyName(
  source: GenerationSource,
  mode: GenerationMode,
): UsagePolicyName {
  if (source === "dashboard") {
    return mode === "clone" ? "dashboardClone" : "dashboardTts";
  }
  return mode === "clone" ? "apiClone" : "apiTts";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterHeaderMs(headers: Record<string, string>, fallbackMs: number): number {
  const retryAfter = Number(headers["Retry-After"]);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return fallbackMs;
  return Math.max(1_000, Math.min(Math.ceil(retryAfter * 1000), 60_000));
}

function terminalBatchStatus(status: BatchJobRecord["status"]): boolean {
  return status === "completed" || status === "partial" || status === "failed" || status === "needs_review";
}

// For a dashboard auto-chunked generation, merge the successful chunk audio
// into one file and save a SINGLE full-audio history record (id = job.id, so it
// is idempotent across worker retries). The per-chunk segment records stay in
// the database for the merged endpoint but are hidden from History because they
// carry segment_of_job_id. Failure here is non-fatal: the job still completes
// and the merged endpoint can rebuild audio on demand.
async function saveMergedDashboardHistory(
  job: BatchJobRecord,
  items: BatchJobItemRecord[],
): Promise<void> {
  try {
    // Idempotency: if the merged record already exists, do nothing.
    const existing = await getUserGenerationRecord(job.userId, job.id);
    if (existing) return;

    const successfulItems = items
      .filter((item) => item.status === "success" && (item.audioBase64 || item.audioObjectKey))
      .sort((a, b) => a.itemIndex - b.itemIndex);
    if (successfulItems.length === 0) return;

    const buffers: Uint8Array[] = [];
    let combinedText = "";
    let totalOutputSeconds = 0;
    let totalCreditsCharged = 0;
    for (const item of successfulItems) {
      const bytes = await resolveAudioBytes({
        audioBase64: item.audioBase64,
        audioObjectKey: item.audioObjectKey,
      });
      if (bytes?.byteLength) {
        buffers.push(bytes);
        combinedText = combinedText ? `${combinedText} ${item.text}` : item.text;
        totalOutputSeconds += item.outputSeconds ?? 0;
        totalCreditsCharged += item.creditsCharged ?? 0;
      }
    }
    if (buffers.length === 0) return;

    const merged = await mergePublicMp3SegmentsForDelivery(buffers, job.outputSeconds, job.mode);
    const mergedBytes = merged.bytes;
    const outputSeconds = Math.max(1, Math.round(merged.outputSeconds ?? totalOutputSeconds ?? job.outputSeconds));
    const inputChars = Array.from(combinedText).length;

    // Store the merged audio in object storage when configured, else inline.
    const stored = await putAudioObject({
      key: buildAudioObjectKey({
        scope: "merged",
        userId: job.userId,
        id: job.id,
        fileName: `${job.id}.wav`,
      }),
      bytes: mergedBytes,
      contentType: merged.contentType,
    });

    await createGenerationRecord({
      id: job.id,
      userId: job.userId,
      apiKeyId: job.apiKeyId ?? null,
      mode: job.mode,
      source: job.source,
      status: "success",
      model: job.model,
      voice: job.voice,
      inputChars,
      inputPreview: buildInputPreview(combinedText),
      outputSeconds,
      creditsRequested: job.creditsEstimated,
      creditsCharged: totalCreditsCharged || job.creditsCharged,
      latencyMs: job.startedAt && job.completedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : 0,
      errorMessage: null,
      audioBase64: stored ? null : Buffer.from(mergedBytes).toString("base64"),
      audioObjectKey: stored?.key ?? null,
      audioObjectUrl: stored?.url ?? null,
      contentType: merged.contentType,
      segmentOfJobId: null,
    });

    await invalidateDashboardCountCache(job.userId, ["history", "billing", "api"]);
  } catch (error) {
    console.error(`[batch-worker] Failed to save merged history for job ${job.id}:`, error);
  }
}

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function webhookMaxAttempts(): number {
  const configured = Number(process.env.BATCH_WEBHOOK_MAX_ATTEMPTS);
  return Number.isInteger(configured) && configured > 0 ? configured : 3;
}

function workerId(input?: string | null): string {
  return (
    input?.trim() ||
    cleanEnv("JOB_WORKER_ID") ||
    cleanEnv("VERCEL_REGION") ||
    "next-inline-worker"
  );
}

function stuckJobTimeoutMs(): number {
  const configured = Number(process.env.BATCH_STUCK_JOB_TIMEOUT_MS);
  return Number.isInteger(configured) && configured > 0 ? configured : 15 * 60 * 1000;
}

function maxStuckRecoveries(): number {
  const configured = Number(process.env.BATCH_STUCK_JOB_MAX_RECOVERIES);
  return Number.isInteger(configured) && configured > 0 ? configured : 3;
}

function maxBatchItemAttempts(): number {
  const configured = Number(process.env.BATCH_ITEM_MAX_ATTEMPTS);
  return Number.isInteger(configured) && configured > 0 ? configured : 5;
}

// Classify errors as transient (worth retrying) or permanent (stop retrying).
// Transient errors are network issues, timeouts, and upstream blips that often
// succeed on the next attempt. Permanent errors are auth failures, validation
// errors, and account issues that will keep failing.
function isTransientBatchError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  // Permanent errors — stop retrying immediately
  if (msg.includes("account") && msg.includes("suspend")) return false;
  if (msg.includes("insufficient") && msg.includes("token")) return false;
  if (msg.includes("voice clone consent")) return false;
  if (msg.includes("permission")) return false;
  if (msg.includes("invalid") && msg.includes("api key")) return false;
  if (msg.includes("billing") || msg.includes("spend limit")) return false;
  // Transient errors — worth retrying
  if (msg.includes("timeout") || msg.includes("timed out")) return true;
  if (msg.includes("empty") || msg.includes("no audio")) return true;
  if (msg.includes("near-silent") || msg.includes("silent")) return true;
  if (msg.includes("upstream") || msg.includes("modal")) return true;
  if (msg.includes("fetch") || msg.includes("network")) return true;
  if (msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  if (msg.includes("rate limit")) return true;
  // Default: treat as transient (retry)
  return true;
}

function retryBackoffMs(attemptCount: number): number {
  const base = Number(process.env.BATCH_ITEM_RETRY_BASE_MS);
  const max = Number(process.env.BATCH_ITEM_RETRY_MAX_MS);
  // First retry: 10s, then 20s, 40s, 80s, 160s (capped at max)
  const baseMs = Number.isInteger(base) && base > 0 ? base : 10_000;
  const maxMs = Number.isInteger(max) && max > 0 ? max : 5 * 60 * 1000;
  return Math.min(baseMs * Math.max(1, 2 ** Math.max(0, attemptCount - 1)), maxMs);
}

function batchItemConcurrency(): number {
  const configured = Number(process.env.BATCH_ITEM_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  // The file-backed local store serializes mutations through one JSON file.
  // Concurrent item finalization can otherwise race and lose a generation
  // record. Postgres production keeps parallel processing. Default 4 so the
  // per-mode usage policy (dashboardTts.maxConcurrent) is the binding limit;
  // override with BATCH_ITEM_CONCURRENCY to raise/lower the worker-wide cap.
  return getStoreMode() === "json" ? 1 : 4;
}

function nextRetryIso(attemptCount: number): string {
  return new Date(Date.now() + retryBackoffMs(attemptCount)).toISOString();
}

const inlineKickState = globalThis as typeof globalThis & {
  __khmerVoxInlineBatchKicks?: Set<string>;
};

function activeInlineBatchKicks(): Set<string> {
  inlineKickState.__khmerVoxInlineBatchKicks ??= new Set<string>();
  return inlineKickState.__khmerVoxInlineBatchKicks;
}

function webhookSigningSecret(): string {
  return cleanEnv("BATCH_WEBHOOK_SIGNING_SECRET");
}

function buildWebhookHeaders(job: BatchJobRecord, body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const event = `batch.job.${job.status}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Khmer-Vox-TTS-Webhook/1.0",
    "X-Khmer-Vox-Event": event,
    "X-Khmer-Vox-Job-Id": job.id,
    "X-Khmer-Vox-Timestamp": timestamp,
  };

  const secret = webhookSigningSecret();
  if (!secret) {
    headers["X-Khmer-Vox-Signature-Configured"] = "false";
    return headers;
  }

  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  headers["X-Khmer-Vox-Signature"] = `sha256=${signature}`;
  headers["X-Khmer-Vox-Signature-Configured"] = "true";
  return headers;
}

function publicBatchJobPayload(job: BatchJobRecord, items: BatchJobItemRecord[]) {
  const urls = publicBatchJobUrls(job.id);
  return {
    event: `batch.job.${job.status}`,
    job: {
      id: job.id,
      external_id: job.externalId,
      mode: job.mode,
      status: job.status,
      title: job.title,
      metadata: parseBatchMetadataJson(job.metadataJson),
      total_items: job.totalItems,
      completed_items: job.completedItems,
      failed_items: job.failedItems,
      total_input_chars: job.totalInputChars,
      credits_estimated: job.creditsEstimated,
      credits_charged: job.creditsCharged,
      output_seconds: job.outputSeconds,
      output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
      error: job.errorMessage,
      created_at: job.createdAt,
      started_at: job.startedAt,
      completed_at: job.completedAt,
      status_url: urls.status_url,
      download_url: urls.download_url,
      audio_url: urls.audio_url,
      zip_url: urls.zip_url,
      v2_status_url: urls.v2_status_url,
      v2_audio_url: urls.v2_audio_url,
    },
    items: items.map((item) => ({
      id: item.externalId ?? String(item.itemIndex + 1),
      index: item.itemIndex,
      external_id: item.externalId,
      speaker: item.speaker,
      start_ms: item.startMs,
      end_ms: item.endMs,
      metadata: parseBatchMetadataJson(item.metadataJson),
      status: item.status,
      generation_id: item.generationId,
      content_type: item.contentType,
      output_format: PUBLIC_AUDIO_OUTPUT_FORMAT,
      output_seconds: item.outputSeconds,
      credits_charged: item.creditsCharged,
      error: item.errorMessage,
      has_audio: Boolean(item.audioBase64 || item.audioObjectKey),
    })),
  };
}

async function postJsonWithTimeout(url: string, body: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BATCH_WEBHOOK_TIMEOUT_MS);
  try {
    return await safeFetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function responsePreview(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, 800) : null;
  } catch {
    return null;
  }
}

async function recordBatchWebhookAttempt(input: {
  job: BatchJobRecord;
  eventType: string;
  deliveryStatus: BatchJobWebhookDeliveryStatus;
  httpStatus: number | null;
  responsePreview: string | null;
  errorMessage: string | null;
  latencyMs: number;
}): Promise<void> {
  if (!input.job.webhookCallbackUrl) return;
  try {
    await createBatchJobWebhookAttempt({
      jobId: input.job.id,
      userId: input.job.userId,
      webhookUrl: input.job.webhookCallbackUrl,
      eventType: input.eventType,
      deliveryStatus: input.deliveryStatus,
      httpStatus: input.httpStatus,
      responsePreview: input.responsePreview,
      errorMessage: input.errorMessage,
      latencyMs: input.latencyMs,
    });
  } catch (error) {
    console.error(`[batch-worker] Failed to record webhook attempt for job ${input.job.id}`, error);
  }
}

async function deliverBatchJobWebhookIfNeeded(
  jobId: string,
  options?: { force?: boolean },
): Promise<void> {
  const loaded = await getBatchJobWithItems(jobId);
  if (!loaded) return;
  const { job, items } = loaded;
  if (!terminalBatchStatus(job.status)) return;
  if (!job.webhookCallbackUrl) return;
  if (job.webhookStatus === "delivered" && !options?.force) return;
  if (job.webhookAttempts >= webhookMaxAttempts() && !options?.force) return;

  const attemptedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const eventType = `batch.job.${job.status}`;
  let deliveryStatus: BatchJobWebhookDeliveryStatus = "failed";
  let httpStatus: number | null = null;
  let preview: string | null = null;
  let errorMessage: string | null = null;

  try {
    const payload = publicBatchJobPayload(job, items);
    const body = JSON.stringify(payload);
    const response = await postJsonWithTimeout(
      job.webhookCallbackUrl,
      body,
      buildWebhookHeaders(job, body),
    );
    httpStatus = response.status;
    preview = await responsePreview(response);
    if (!response.ok) {
      throw new Error(`Webhook responded with HTTP ${response.status}.`);
    }
    deliveryStatus = "delivered";
  } catch (error) {
    errorMessage =
      error instanceof Error && error.message.trim()
        ? error.message.slice(0, 260)
        : "Webhook delivery failed.";
  }

  await recordBatchWebhookAttempt({
    job,
    eventType,
    deliveryStatus,
    httpStatus,
    responsePreview: preview,
    errorMessage,
    latencyMs: Date.now() - startedAtMs,
  });

  if (deliveryStatus === "delivered") {
    await updateBatchJobWebhookStatus({
      jobId: job.id,
      webhookStatus: "delivered",
      webhookLastError: null,
      webhookLastAttemptAt: attemptedAt,
      incrementAttempts: true,
    });
    return;
  }

  await updateBatchJobWebhookStatus({
    jobId: job.id,
    webhookStatus: "failed",
    webhookLastError: errorMessage,
    webhookLastAttemptAt: attemptedAt,
    incrementAttempts: true,
  });
}

export async function retryBatchJobWebhook(jobId: string): Promise<boolean> {
  const loaded = await getBatchJobWithItems(jobId);
  if (!loaded?.job.webhookCallbackUrl || !terminalBatchStatus(loaded.job.status)) {
    return false;
  }
  await deliverBatchJobWebhookIfNeeded(jobId, { force: true });
  return true;
}

async function writeWorkerHeartbeat(input: {
  workerId: string;
  status: WorkerHeartbeatStatus;
  currentJobId: string | null;
  processedJobId: string | null;
  processedItemCount: number;
  upstreamLatencyMs: number | null;
  upstreamOk: boolean | null;
  lastError: string | null;
}): Promise<void> {
  try {
    await recordWorkerHeartbeat({
      ...input,
      stuckTimeoutMs: stuckJobTimeoutMs(),
    });
  } catch (error) {
    console.error(`[batch-worker] Failed to record worker heartbeat for ${input.workerId}`, error);
  }
}

export async function recoverStuckBatchQueue(): Promise<Awaited<ReturnType<typeof recoverStuckBatchJobs>>> {
  return recoverStuckBatchJobs({
    timeoutMs: stuckJobTimeoutMs(),
    maxRecoveries: maxStuckRecoveries(),
    maxItemAttempts: maxBatchItemAttempts(),
  });
}

async function acquireBatchItemRateLimit(
  userId: string,
  source: GenerationSource,
  mode: GenerationMode,
): Promise<BatchRateLimitAcquireResult> {
  const policyName = batchRateLimitPolicyName(source, mode);
  const policy = getUsagePolicy(policyName);
  const key = `batch:${userId}:${mode}:${source}`;
  let retryDelayMs = BATCH_RATE_LIMIT_WAIT_MS;
  let lastMessage = "Waiting for generation capacity. The job will retry automatically.";

  for (let attempt = 0; attempt < BATCH_RATE_LIMIT_MAX_RETRIES; attempt++) {
    const result = await acquireUsageLimit(key, policy);
    if (result.ok) return result;
    lastMessage = result.message;

    if (result.code === "RATE_LIMITED") {
      const waitMs = Math.min(
        Math.max(
          retryAfterHeaderMs(result.headers, BATCH_RATE_LIMIT_WAIT_MS),
          BATCH_RATE_LIMIT_WAIT_MS * Math.pow(2, attempt),
        ),
        30_000,
      );
      retryDelayMs = waitMs;
      console.warn(
        `[batch-worker] Rate limited for ${key}, waiting ${waitMs}ms (attempt ${attempt + 1}/${BATCH_RATE_LIMIT_MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (result.code === "TOO_MANY_CONCURRENT_REQUESTS") {
      const waitMs = Math.min(
        Math.max(
          retryAfterHeaderMs(result.headers, BATCH_RATE_LIMIT_WAIT_MS),
          BATCH_RATE_LIMIT_WAIT_MS * Math.pow(2, attempt),
        ),
        30_000,
      );
      retryDelayMs = waitMs;
      console.warn(
        `[batch-worker] Too many concurrent requests for ${key}, waiting ${waitMs}ms (attempt ${attempt + 1}/${BATCH_RATE_LIMIT_MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (result.code === "RATE_LIMIT_UNAVAILABLE") {
      const waitMs = 500 + Math.random() * 500;
      retryDelayMs = Math.max(retryDelayMs, 15_000);
      console.warn(
        `[batch-worker] Rate limiter temporarily unavailable for ${key}, retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${BATCH_RATE_LIMIT_MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    console.error(
      `[batch-worker] Rate limit error for ${key}: ${result.code} - ${result.message}`,
    );
    retryDelayMs = retryAfterHeaderMs(result.headers, 15_000);
    break;
  }

  console.error(
    `[batch-worker] Rate limit retries exhausted for ${key} after ${BATCH_RATE_LIMIT_MAX_RETRIES} attempts`,
  );
  return {
    ok: false,
    retryAt: new Date(Date.now() + Math.max(5_000, retryDelayMs)).toISOString(),
    message: lastMessage || "Waiting for generation capacity. The job will retry automatically.",
  };
}

export async function processBatchJob(jobId: string, options?: { workerId?: string | null }): Promise<{
  job: BatchJobRecord | null;
  items: BatchJobItemRecord[];
}> {
  const activeWorkerId = workerId(options?.workerId);
  await writeWorkerHeartbeat({
    workerId: activeWorkerId,
    status: "busy",
    currentJobId: jobId,
    processedJobId: null,
    processedItemCount: 0,
    upstreamLatencyMs: null,
    upstreamOk: null,
    lastError: null,
  });

  // Reset retryable items back to 'queued' so they are processed
  await resetRetryableBatchJobItems(jobId, maxBatchItemAttempts());

  const loaded = await getBatchJobWithItems(jobId);
  if (!loaded) return { job: null, items: [] };

  let { job } = loaded;
  if (terminalBatchStatus(job.status)) {
    const refreshed = await refreshBatchJobRollup(job.id);
    const current = refreshed ? await getBatchJobWithItems(job.id) : loaded;
    await deliverBatchJobWebhookIfNeeded(job.id);
    return current ?? loaded;
  }

  // Server-side timeout: fail jobs that have been running too long
  const maxAgeMs = Number(process.env.BATCH_JOB_MAX_AGE_MS || 180000);
  const jobAge = Date.now() - new Date(job.startedAt ?? job.createdAt).getTime();
  if (jobAge > maxAgeMs && job.status === "running") {
    const timeoutMsg = `Job timed out after ${Math.round(jobAge / 1000)}s (max ${Math.round(maxAgeMs / 1000)}s)`;
    await failRemainingItems(job.id, timeoutMsg, "failed");
    await updateBatchJobStatus({ jobId: job.id, status: "failed", errorMessage: timeoutMsg });
    const failed = await getBatchJobWithItems(job.id);
    return failed ?? { job, items: [] };
  }

  if (job.status === "queued") {
    const claimed = await claimQueuedBatchJob(job.id, activeWorkerId);
    if (!claimed) {
      return loaded;
    }
    job = claimed;
  }

  const cloneSample = job.mode === "clone" ? (storedCloneSample(job) ?? undefined) : undefined;
  const mergeJob = isDashboardMergeJob(job);
  // Opt-in reference denoise flag persisted on the dashboard-merge job metadata.
  const mergeOptions = readDashboardMergeOptions(job);
  const denoiseReference = mergeOptions.denoiseReference === true;
  const jobVoiceStyle = mergeOptions.voiceStyle ?? "normal";
  if (job.mode === "clone" && !cloneSample) {
    await failRemainingItems(
      job.id,
      "Clone voice sample is no longer available for this queued job.",
      "needs_review",
    );
    await clearBatchJobCloneSample(job.id);
    const failed = await getBatchJobWithItems(job.id);
    return failed ?? { job, items: [] };
  }

  let processedCount = 0;
  const upstreamLatencies: number[] = [];
  let lastWorkerError: string | null = null;
  let isSuspended = false;

  const policyConcurrency = getUsagePolicy(batchRateLimitPolicyName(job.source, job.mode)).maxConcurrent;
  const configuredConcurrency = batchItemConcurrency();
  const maxConcurrentItems = Math.max(1, Math.min(configuredConcurrency, policyConcurrency));
  const queuedItems = loaded.items.filter((item) => item.status === "queued");

  if (queuedItems.length > 0) {
    await updateBatchJobStatus({
      jobId: job.id,
      status: "running",
      workerHeartbeatAt: new Date().toISOString(),
    });

    const activePromises: Promise<void>[] = [];
    let isDeferredForCapacity = false;

    for (const item of queuedItems) {
      if (isSuspended || isDeferredForCapacity) break;

      // Limit concurrency
      if (activePromises.length >= maxConcurrentItems) {
        await Promise.race(activePromises);
      }
      if (isSuspended || isDeferredForCapacity) break;

      const promise = (async () => {
        // Acquire rate limit BEFORE generating each item.
        const limit = await acquireBatchItemRateLimit(job.userId, job.source, job.mode);

        if (!limit.ok) {
          isDeferredForCapacity = true;
          lastWorkerError = limit.message;
          await updateBatchJobStatus({
            jobId: job.id,
            status: "queued",
            errorMessage: limit.message,
            lastWorkerError: limit.message,
            nextRetryAt: limit.retryAt,
            workerHeartbeatAt: new Date().toISOString(),
          });
          return;
        }

        const runningItem = await claimQueuedBatchJobItem(item.id);
        if (!runningItem) {
          await limit.release();
          return;
        }

        try {
          const result = await runGenerationForUser({
            userId: job.userId,
            apiKeyId: job.apiKeyId ?? null,
            source: job.source,
            mode: job.mode,
            text: runningItem.text,
            voice: runningItem.voice,
            model: runningItem.model,
            cloneSample,
            // For dashboard auto-chunked jobs, tag each chunk's generation
            // record so it is hidden from History; the merged full-audio
            // record is saved once when the job completes.
            segmentOfJobId: mergeJob ? job.id : null,
            denoiseReference,
            voiceStyle: jobVoiceStyle,
          });

          await updateBatchJobItem({
            itemId: runningItem.id,
            status: "success",
            generationId: result.generationId,
            audioBase64: result.audioObjectKey ? null : result.audioBase64,
            audioObjectKey: result.audioObjectKey,
            audioObjectUrl: result.audioObjectUrl,
            contentType: result.contentType,
            outputSeconds: result.outputSeconds,
            creditsCharged: result.creditsCharged,
            latencyMs: result.latencyMs,
            errorMessage: null,
          });
          upstreamLatencies.push(result.latencyMs);
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim()
              ? error.message.slice(0, 260)
              : "Batch item failed.";
          // For permanent errors, don't retry — fail immediately.
          // For transient errors, retry up to maxBatchItemAttempts().
          if (error instanceof GenerationServiceError && error.code === "MODAL_CAPACITY_FULL") {
            const retryAt = nextRetryIso(1);
            isDeferredForCapacity = true;
            lastWorkerError = message;
            await updateBatchJobItem({
              itemId: runningItem.id,
              status: "queued",
              nextRetryAt: retryAt,
              errorMessage: message,
            });
            await updateBatchJobStatus({
              jobId: job.id,
              status: "queued",
              errorMessage: message,
              lastWorkerError: message,
              nextRetryAt: retryAt,
              workerHeartbeatAt: new Date().toISOString(),
            });
            return;
          }
          const transient = isTransientBatchError(error);
          const exhausted = !transient || runningItem.attemptCount >= maxBatchItemAttempts();
          await updateBatchJobItem({
            itemId: runningItem.id,
            status: "failed",
            nextRetryAt: exhausted ? null : nextRetryIso(runningItem.attemptCount),
            errorMessage: exhausted
              ? `${message} (${transient ? "retries exhausted" : "permanent error"})`
              : message,
          });
          lastWorkerError = message;

          if (error instanceof GenerationServiceError && error.code === "ACCOUNT_SUSPENDED") {
            isSuspended = true;
            await limit.release();
            await updateBatchJobStatus({
              jobId: job.id,
              status: "needs_review",
              errorMessage: message,
              deadLetterReason: message,
              lastWorkerError: message,
              nextRetryAt: null,
              completedAt: new Date().toISOString(),
            });
            return;
          }
        } finally {
          await limit.release();
          await refreshBatchJobRollup(job.id);
        }

        processedCount++;
        await writeWorkerHeartbeat({
          workerId: activeWorkerId,
          status: "busy",
          currentJobId: job.id,
          processedJobId: null,
          processedItemCount: processedCount,
          upstreamLatencyMs: upstreamLatencies.length
            ? Math.round(upstreamLatencies.reduce((sum, value) => sum + value, 0) / upstreamLatencies.length)
            : null,
          upstreamOk: lastWorkerError ? false : upstreamLatencies.length > 0 ? true : null,
          lastError: lastWorkerError,
        });
      })();

      activePromises.push(promise);
      promise.then(() => {
        const idx = activePromises.indexOf(promise);
        if (idx !== -1) activePromises.splice(idx, 1);
      });

      // Small staggered delay between starting items to prevent thundering herd
      await sleep(200);
    }

    await Promise.all(activePromises);
  }

  const completed = await refreshBatchJobRollup(job.id);
  const fresh = await getBatchJobWithItems(job.id);
  const finalJob = completed ?? fresh?.job ?? job;
  if (terminalBatchStatus(finalJob.status)) {
    if (mergeJob && (finalJob.status === "completed" || finalJob.status === "partial")) {
      await saveMergedDashboardHistory(finalJob, fresh?.items ?? loaded.items);
    }
    await clearBatchJobCloneSample(finalJob.id);
    await deliverBatchJobWebhookIfNeeded(finalJob.id);
  }

  await writeWorkerHeartbeat({
    workerId: activeWorkerId,
    status: finalJob.status === "queued" ? "idle" : "online",
    currentJobId: null,
    processedJobId: finalJob.id,
    processedItemCount: processedCount,
    upstreamLatencyMs: upstreamLatencies.length
      ? Math.round(upstreamLatencies.reduce((sum, value) => sum + value, 0) / upstreamLatencies.length)
      : null,
    upstreamOk: lastWorkerError ? false : upstreamLatencies.length > 0 ? true : null,
    lastError: lastWorkerError,
  });

  return {
    job: finalJob,
    items: fresh?.items ?? loaded.items,
  };
}

export async function processNextBatchJob(options?: { workerId?: string | null }): Promise<{
  job: BatchJobRecord | null;
  items: BatchJobItemRecord[];
}> {
  const activeWorkerId = workerId(options?.workerId);
  const recovery = await recoverStuckBatchQueue();
  const claimed = await claimNextQueuedBatchJob(activeWorkerId);
  if (!claimed) {
    await writeWorkerHeartbeat({
      workerId: activeWorkerId,
      status: recovery.movedToReviewJobs > 0 || recovery.recoveredJobs > 0 ? "stuck" : "idle",
      currentJobId: null,
      processedJobId: null,
      processedItemCount: 0,
      upstreamLatencyMs: null,
      upstreamOk: null,
      lastError: recovery.movedToReviewJobs > 0
        ? `Moved ${recovery.movedToReviewJobs.toLocaleString()} stuck job(s) to review.`
        : recovery.recoveredJobs > 0
          ? `Recovered ${recovery.recoveredJobs.toLocaleString()} stuck job(s).`
          : null,
    });
    return { job: null, items: [] };
  }
  return processBatchJob(claimed.id, { workerId: activeWorkerId });
}

export function kickBatchWorker(jobId: string): void {
  if (process.env.DISABLE_INLINE_JOB_WORKER === "true") return;

  const activeKicks = activeInlineBatchKicks();
  if (activeKicks.has(jobId)) return;
  activeKicks.add(jobId);

  const maxRetries = 2;
  const activeWorkerId = workerId("inline-kick");

  function releaseKick(): void {
    activeKicks.delete(jobId);
  }

  async function runWithRetry(attempt: number): Promise<void> {
    try {
      const result = await processBatchJob(jobId, { workerId: activeWorkerId });
      if (result.job?.status === "queued" && result.job.nextRetryAt) {
        const retryAt = new Date(result.job.nextRetryAt).getTime();
        const delay = Math.max(1_000, Math.min(retryAt - Date.now(), retryBackoffMs(maxBatchItemAttempts())));
        setTimeout(() => {
          void runWithRetry(0);
        }, delay);
        return;
      }
      releaseKick();
    } catch (error) {
      console.error(
        `[batch-worker] Failed to process batch job ${jobId} (attempt ${attempt + 1}/${maxRetries + 1})`,
        error,
      );
      if (attempt < maxRetries) {
        const retryDelay = 5_000 * (attempt + 1);
        console.warn(
          `[batch-worker] Retrying batch job ${jobId} in ${retryDelay}ms`,
        );
        await sleep(retryDelay);
        await runWithRetry(attempt + 1);
      } else {
        // All retries exhausted - mark remaining items as failed
        console.error(
          `[batch-worker] All retries exhausted for batch job ${jobId}. Marking remaining items as failed.`,
        );
        try {
          await failRemainingItems(
            jobId,
            "Batch processing failed after multiple retries. Please try again.",
            "needs_review",
          );
        } catch (failError) {
          console.error(
            `[batch-worker] Failed to mark remaining items as failed for job ${jobId}`,
            failError,
          );
        }
        releaseKick();
      }
    }
  }

  setTimeout(() => {
    void runWithRetry(0);
  }, 0);
}

export async function createAndRunBatchJob(params: {
  userId: string;
  apiKeyId?: string | null;
  source: GenerationSource;
  mode: GenerationMode;
  title?: string;
  lines: Array<string | BatchLineInput>;
  voice: string;
  model?: string;
  cloneSample?: CloneSample;
  cloneConsentAccepted?: boolean;
  webhookCallbackUrl?: string | null;
  externalId?: string | null;
  metadataJson?: string | null;
}): Promise<{ job: BatchJobRecord; items: BatchJobItemRecord[] }> {
  const queued = await createQueuedBatchJob(params);
  const processed = await processBatchJob(queued.job.id);
  if (!processed.job) {
    throw new BatchJobServiceError("Batch job disappeared before processing.", 500, "BATCH_NOT_FOUND");
  }
  return { job: processed.job, items: processed.items };
}
